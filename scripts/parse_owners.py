"""Read owner names from RT Sports roster PDFs and write data/team_owners.json.

Roster headers are "Owner: Name" under the team (2001-2003) or "Team - Owner" (2005+).
RT's 2004 roster file prints no owners; 2004 is filled from 2003/2005, where every team
but one kept its name and the one rename (Alantic City Hugs and Tickles) sits between
Mark's 2003 and 2005 teams.

Usage: python3 parse_owners.py <pdf_folder> <data/history.json> <out team_owners.json> <private owner-aliases.json>
"""
import json, re, subprocess, sys, pathlib

# Raw owner text as RT printed it -> owner id.  The table holds real names, so it is
# kept OUT of this public repo, in a private JSON file: [["regex", "owner-id"], ...]
ALIASES = []


CROWN = re.compile(r"^(The)?World Champion ")


def base(n):
    return CROWN.sub(lambda m: "The " if m.group(1) else "", n).strip()


def owner_id(raw):
    raw = raw.strip()
    for pat, oid in ALIASES:
        if re.search(pat, raw):
            return oid
    raise SystemExit(f"Unknown owner text: {raw!r} - add it to the private aliases file")


def text(p):
    return subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, text=True).stdout


def owners_in(pdf, teams):
    t, found = text(pdf), {}
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    for i, l in enumerate(lines):                       # 2001-2003 style
        m = re.match(r"^Owner:\s*(.+)$", l)
        if m and i and base(lines[i - 1]) in teams:
            found[base(lines[i - 1])] = owner_id(m.group(1))
    for l in t.splitlines():                            # 2005+ style, two per line
        for cell in re.split(r"\s{3,}", l.strip()):
            for team in teams:
                for shown in (team, "World Champion " + team, "TheWorld Champion " + team.removeprefix("The ")):
                    if cell.startswith(shown + " - "):
                        found[team] = owner_id(cell[len(shown) + 3:])
    return found


def main(folder, history, out, aliases):
    ALIASES[:] = [tuple(x) for x in json.load(open(aliases))]
    h = json.load(open(history))
    result = {}
    for s in h["seasons"]:
        teams = {base(t["team"]) for d in s["divisions"] for t in d["teams"]}
        if not teams:
            continue
        pdfs = sorted(pathlib.Path(folder).glob(f"{s['year']}-roster*.pdf"))
        result[str(s["year"])] = owners_in(pdfs[0], teams) if pdfs else {}
    # 2004: see module docstring
    if "2004" in result and not result["2004"] and "2003" in result and "2005" in result:
        prev = {**result["2003"], **result["2005"]}
        y04 = {t: prev[t] for t in prev if t in {base(x["team"]) for s in h["seasons"] if s["year"] == 2004 for d in s["divisions"] for x in d["teams"]}}
        left = {base(x["team"]) for s in h["seasons"] if s["year"] == 2004 for d in s["divisions"] for x in d["teams"]} - set(y04)
        used = set(y04.values())
        spare = set(result["2003"].values()) & set(result["2005"].values()) - used
        if len(left) == 1 and len(spare) == 1:
            y04[left.pop()] = spare.pop()
        result["2004"] = y04
    missing = {y: sorted({base(x["team"]) for s in h["seasons"] if str(s["year"]) == y for d in s["divisions"] for x in d["teams"]} - set(m)) for y, m in result.items()}
    missing = {y: v for y, v in missing.items() if v}
    if len(sys.argv) > 5:  # private team-renames file: keep last names out of the public data
        ren = json.load(open(sys.argv[5]))
        result = {y: {ren.get(t, t): o for t, o in m.items()} for y, m in result.items()}
    json.dump(result, open(out, "w"), indent=1, ensure_ascii=False)
    print("missing owners:", missing or "none")


if __name__ == "__main__":
    main(*sys.argv[1:5])
