"""Parse RT Sports archive PDFs (standings + schedule) for the Pinche Garcia site.

Handles the three schedule layouts RT Sports used over the years:
  2001-2002  "WEEK: 3"  then "Team A 86, Team B 49"
  2003       "FFL: Week 3" then "Team A 86 , Team B 49" (names can wrap)
  2004-2010  two-column grid, "86   Team A   49   Team B" (names cut at 28 chars)
  2011+      "Week 3 - NFL Week 3" (2015: "FFL Week 3 - NFL Week 3") then "Team A   86   vs   Team B   49"

Usage: python3 parse_archive.py <pdf_folder> <out.json>
"""
import json, re, subprocess, sys, pathlib

NUM = r"-?\d+(?:\.\d+)?"
CHAMP = "World Champion "


def text(p):
    return subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, text=True).stdout


def base(name):
    return name[len(CHAMP):] if name.startswith(CHAMP) else name


# ---------------- standings ----------------
PCT = re.compile(r"^(?:0?\.\d{3}|1\.000)$")


def parse_row(buf):
    """buf: one team's text, possibly spread over wrapped lines."""
    # a long name can run straight into the W column ("Ball Breakers6")
    buf = re.sub(r"(?<=[A-Za-z\x27!?,)])(?=\d)|(?<=\d)(?=[A-Za-z])", " ", buf)
    toks = buf.split()
    i = next((k for k, x in enumerate(toks) if PCT.match(x)), None)
    if i is None:
        return None
    before, after = toks[:i], toks[i + 1:]
    ints = [x for x in before if x.isdigit()]
    if len(ints) < 3:
        return None
    w, l, t = map(int, ints[-3:])
    # name = words before PCT that are not the W/L/T numbers (wrap can push words after them)
    words, skip = [], 3
    for x in reversed(before):
        if x.isdigit() and skip:
            skip -= 1
            continue
        words.append(x)
    name = " ".join(reversed(words))
    total = None
    if re.fullmatch(r"\d+-\d+(-\d+)?", after[0]):  # 2011+ : DIV PF PA PTS
        pf, pa = float(after[1]), float(after[2])
        total = float(after[3]) if len(after) > 3 else None  # season total incl. playoffs
    else:  # older : PF PA DIV STREAK
        pf, pa = float(after[0]), float(after[1])
    return dict(team=name, w=w, l=l, t=t, pf=pf, pa=pa, total=total)


def parse_standings(t):
    teams, div, buf = [], None, ""
    for line in t.splitlines():
        s = line.strip()
        if not s:
            continue
        m = re.match(r"^(.+?) Division$", s)
        if m:
            div, buf = m.group(1).strip(), ""
            continue
        if s.startswith(("Total Points", "WEEK ", "END OF", "Copyright")):
            div, buf = None, ""
            continue
        if not div or s.startswith("TEAM") or re.match(r"^W\s+L\s+T", s):
            continue
        buf = (buf + " " + s).strip()
        r = parse_row(buf)
        if r:
            r["division"] = div
            teams.append(r)
            buf = ""
    return teams


# ---------------- schedule ----------------
def resolve(name, full_names):
    name = name.strip().rstrip(",").strip()
    if name in full_names:
        return name
    hits = [f for f in full_names if f.startswith(name)]
    return hits[0] if len(hits) == 1 else name


def week_obj(label):
    return dict(label=label, playoff="playoff" in label.lower(), games=[])


def parse_old(t):
    """2001-2003 single-column formats."""
    weeks, cur, carry = [], None, ""
    for line in t.splitlines():
        s = line.strip()
        if not s:
            continue
        m = re.match(r"^WEEK:\s*(.+)$", s) or re.match(r"^FFL:\s*(.+?)\s{2,}NFL", s)
        if m:
            cur = week_obj(m.group(1).strip().title())
            weeks.append(cur)
            carry = ""
            continue
        if cur is None or s.startswith(("NFL WEEK", "Copyright", "RealTime")) or "Results" in s:
            continue
        s = (carry + " " + s).strip() if carry else s
        m = re.match(rf"^(.+?) ({NUM}) ?, (.+?) ({NUM})$", s)
        if m:
            cur["games"].append([m.group(1), float(m.group(2)), m.group(3), float(m.group(4))])
            carry = ""
        elif re.search(rf"{NUM} ?, ", s):
            carry = s  # opponent name wrapped to next line
    return weeks


def parse_grid(t):
    """2004-2010 two-column grid."""
    lines = t.splitlines()
    split = None
    for l in lines:
        hs = [m.start() for m in re.finditer(r"(?:Playoff )?Week \d+ Games", l)]
        if len(hs) == 2:
            split = hs[1]
            break
    cols = {0: [], 1: []}
    for l in lines:
        cut = min(split, len(l))
        while 0 < cut < len(l) and not (l[cut - 1] == " " and l[cut - 2:cut] == "  "):
            cut -= 1  # back up to a whitespace gap so no name or score is split
        cols[0].append(l[:cut])
        cols[1].append(l[cut:])
    weeks = []
    for c in (0, 1):
        cur = None
        for l in cols[c]:
            s = l.strip()
            m = re.match(r"^((?:Playoff )?Week \d+) Games$", s)
            if m:
                cur = week_obj(m.group(1))
                weeks.append(cur)
                continue
            m = re.match(rf"^({NUM})\s+(.+?)\s+({NUM})\s+(.+?)$", s)
            if cur is not None and m:
                cur["games"].append([m.group(2), float(m.group(1)), m.group(4), float(m.group(3))])
    order = lambda w: (w["playoff"], int(re.search(r"\d+", w["label"]).group()))
    return sorted(weeks, key=order)


def parse_new(t):
    """2011+ 'Week 3 - NFL Week 3' format."""
    weeks, cur = [], None
    for line in t.splitlines():
        s = line.strip()
        m = re.match(r"^(?:FFL )?((?:Playoff )?Week \d+) - NFL Week \d+$", s)
        if m:
            cur = week_obj(m.group(1))
            weeks.append(cur)
            continue
        m = re.match(rf"^(.+?)\s+({NUM})\s+vs\s+(.+?)\s+({NUM})$", s)
        if cur is not None and m:
            cur["games"].append([m.group(1), float(m.group(2)), m.group(3), float(m.group(4))])
    return weeks


def parse_schedule(t, full_names):
    if "WEEK:" in t or "FFL:" in t:
        weeks = parse_old(t)
    elif re.search(r"Week \d+ Games", t):
        weeks = parse_grid(t)
    else:
        weeks = parse_new(t)
    for w in weeks:
        w["games"] = [dict(a=resolve(a, full_names), as_=x, b=resolve(b, full_names), bs=y) for a, x, b, y in w["games"]]
    return [w for w in weeks if w["games"]]


def main(folder, out):
    folder = pathlib.Path(folder)
    data = {}
    for sp in sorted(folder.glob("*-standings.pdf")):
        yr = sp.name[:4]
        st = parse_standings(text(sp))
        names = [r["team"] for r in st]
        sch = folder / f"{yr}-schedule.pdf"
        m = re.search(r"^\s*((?:Old Ma[ny] )?Pinche[\w ]*League)", text(sp) + "\n" + (text(sch) if sch.exists() else ""), re.M)
        data[yr] = dict(leagueName=m.group(1).strip() if m else None, standings=st,
                        weeks=parse_schedule(text(sch), names) if sch.exists() else [])
    json.dump(data, open(out, "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
