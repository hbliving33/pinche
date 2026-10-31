"""Turn parsed archive data into data/history.json for the site.
Usage: python3 build_history.py <raw.json> <league.json> <out history.json> [team_owners.json] [private team-renames.json]"""
import json, sys

CHAMP = "World Champion "
import re
# RT prefixes the defending champ's name: "World Champion X", sometimes glued: "TheWorld Champion X"
base = lambda n: re.sub(r"^(The)?World Champion ", lambda m: "The " if m.group(1) else "", n) if n else n
crowned_name = lambda n: bool(n) and re.match(r"^(The)?World Champion ", n) is not None


def season(year, v):
    st, weeks = v["standings"], v["weeks"]
    reg = [w for w in weeks if not w["playoff"]]
    po = [w for w in weeks if w["playoff"]]
    champ = runner = final = None
    if po and len(po[-1]["games"]) == 1 and len(po) >= 2:
        g = po[-1]["games"][0]
        win, lose, ws, ls = (g["a"], g["b"], g["as_"], g["bs"]) if g["as_"] > g["bs"] else (g["b"], g["a"], g["bs"], g["as_"])
        champ, runner, final = win, lose, [ws, ls]
    divisions = []
    for r in st:
        if not divisions or divisions[-1]["name"] != r["division"]:
            divisions.append(dict(name=r["division"], teams=[]))
        divisions[-1]["teams"].append(dict(team=r["team"], w=r["w"], l=r["l"], t=r["t"], pf=r["pf"], pa=r["pa"]))
    scores = []
    for w in weeks:
        for g in w["games"]:
            scores += [(g["as_"], g["a"], w["label"]), (g["bs"], g["b"], w["label"])]
    hi = max(scores) if scores else None
    # RT's "Most Points" uses the PTS column when it exists (2011+), otherwise PF
    pts = lambda r: r.get("total") if r.get("total") is not None else r["pf"]
    most = max(st, key=pts) if st else None
    return dict(
        year=int(year), leagueName=v.get("leagueName"),
        champion=dict(team=champ, runnerUp=runner, score=final) if champ else None,
        mostPoints=dict(team=most["team"], points=pts(most)) if most else None,
        highWeek=dict(team=hi[1], points=hi[0], week=hi[2]) if hi else None,
        divisions=divisions,
        weeks=[dict(label=w["label"], playoff=w["playoff"],
                    games=[[g["a"], g["as_"], g["b"], g["bs"]] for g in w["games"]]) for w in weeks],
        source="archive")


def scrub(obj, renames):
    """Replace team names that contain someone's last name (map kept in a private file)."""
    txt = json.dumps(obj, ensure_ascii=False)
    for old, new in renames.items():
        txt = txt.replace(json.dumps(old, ensure_ascii=False)[1:-1], json.dumps(new, ensure_ascii=False)[1:-1])
    return json.loads(txt)


def main(raw, league, out, owners_file=None, renames_file=None):
    renames = json.load(open(renames_file)) if renames_file else {}
    raw = scrub(json.load(open(raw)), renames)
    owners = scrub(json.load(open(owners_file)), renames) if owners_file else {}
    old = {s["year"]: s for s in json.load(open(league)).get("seasons", [])}
    seasons = {int(y): season(y, v) for y, v in raw.items()}
    for y, s in old.items():  # keep screenshot facts for years not yet imported
        if y not in seasons and (s.get("mostPoints") or s.get("highWeek")):
            seasons[y] = dict(year=y, champion=None, mostPoints=s["mostPoints"], highWeek=s["highWeek"],
                              divisions=[], weeks=[], source="summary")
    # a "World Champion" prefix the next year confirms (or supplies) the champion
    for y, s in seasons.items():
        nxt = seasons.get(y + 1)
        if not nxt or not nxt["divisions"]:
            continue
        crowned = [base(t["team"]) for d in nxt["divisions"] for t in d["teams"] if crowned_name(t["team"])]
        if crowned:
            s["crownedNextYear"] = crowned[0]
            if s["champion"] and base(s["champion"]["team"]) != crowned[0]:
                s["renamedAs"] = crowned[0]  # champion changed team name the next year
            elif not s["champion"]:
                s["champion"] = dict(team=crowned[0], runnerUp=None, score=None)
    splits = json.load(open(league)).get("ownerSplits", [])
    for y, s in seasons.items():  # toilet bowl + overall regular-season finish
        rows = [t for d in s["divisions"] for t in d["teams"]]
        pct = lambda t: (t["w"] + t["t"] / 2) / max(1, t["w"] + t["l"] + t["t"])
        for i, t in enumerate(sorted(rows, key=lambda t: (-pct(t), -t["pf"]))):
            t["finish"] = i + 1
        # Toilet bowl: the bottom team of each division (ties count) play in the playoffs; the loser is it.
        bottoms = []
        for d in s["divisions"]:
            worst = min(pct(t) for t in d["teams"])
            bottoms.append({base(t["team"]) for t in d["teams"] if pct(t) == worst})
        s["toiletBowl"] = None
        if len(bottoms) == 2:
            for w in [w for w in s["weeks"] if w["playoff"]]:
                for a, x, b, yy in w["games"]:
                    A, B = base(a), base(b)
                    if (A in bottoms[0] and B in bottoms[1]) or (A in bottoms[1] and B in bottoms[0]):
                        if x != yy and not s["toiletBowl"]:
                            lose, win, ls, ws = (A, B, x, yy) if x < yy else (B, A, yy, x)
                            s["toiletBowl"] = dict(loser=lose, winner=win, score=[ls, ws], week=w["label"])
                if s["toiletBowl"]:
                    break
    for y, s in seasons.items():  # owner id on every team row, champion and runner-up
        om = dict(owners.get(str(y), {}))
        for sp in splits:  # same name on RT, different person
            if y < sp["before"]:
                om = {t: (sp["becomes"] if o == sp["owner"] else o) for t, o in om.items()}
        for d in s["divisions"]:
            for t in d["teams"]:
                t["owner"] = om.get(base(t["team"]))
        if s.get("champion"):
            s["champion"]["owner"] = om.get(base(s["champion"]["team"]))
            if s["champion"].get("runnerUp"):
                s["champion"]["runnerUpOwner"] = om.get(base(s["champion"]["runnerUp"]))
        s["owners"] = {base(k): v for k, v in om.items()}
        if s.get("toiletBowl"):
            s["toiletBowl"]["loserOwner"] = om.get(s["toiletBowl"]["loser"])
            s["toiletBowl"]["winnerOwner"] = om.get(s["toiletBowl"]["winner"])
    for m in json.load(open(league)).get("manualChampions", []):  # winners known from league memory only
        y = m["year"]
        if y not in seasons:
            seasons[y] = dict(year=y, champion=None, mostPoints=None, highWeek=None, divisions=[], weeks=[], source="manual")
        if not seasons[y].get("champion"):
            team = next((t for t, o in seasons[y].get("owners", {}).items() if o == m["owner"]), None)
            seasons[y]["champion"] = dict(team=team, runnerUp=None, score=None, owner=m["owner"])
        seasons[y]["championSource"] = "league records"
    first = min(seasons)
    allyears = [seasons.get(y, dict(year=y, champion=None, mostPoints=None, highWeek=None, divisions=[], weeks=[], source="missing"))
                for y in range(max(seasons), first - 1, -1)]
    json.dump(dict(seasons=allyears), open(out, "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main(*sys.argv[1:6])
