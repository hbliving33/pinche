# Pinche Garcia — League History Site

The full history of the Pinche Garcia fantasy football league, preserved outside RT Sports.

## Members-only lock
All league data is encrypted (AES-256-GCM, key from PBKDF2-SHA256).  This repo holds only the
encrypted files (`data/*.enc`, `data/lock.json`).  Visitors enter the one league password once;
the browser remembers it on that device.

The plain source data lives outside the repo, in `D:\Eric\Pinche\private\site-data`
(league.json, history.json, keepers.json, partners.json, team_owners.json, rules.html, keepers photo).

Re-lock after any data change, or to change the password (everyone then re-enters the new one):

    python3 scripts/lock_data.py <site-data folder> data "<league password>"

## Layout
- `index.html`, `history.html`, `season.html`, `records.html`, `h2h.html`, `owners.html`, `partners.html`, `keepers.html`, `rules.html` — pages, all rendered by `assets/app.js`
- `scripts/parse_archive.py` — reads the RT Sports archive PDFs (standings + schedule) in any layout RT used since 2001
- `scripts/build_history.py` — turns the parsed archive into history.json
- `scripts/parse_owners.py` — maps teams to owners from RT roster pages
- `scripts/lock_data.py` — encrypts the site data

## Adding seasons
Build into the private site-data folder, then lock:

    python3 scripts/parse_archive.py <pdf folder> raw.json
    python3 scripts/build_history.py raw.json <site-data>/league.json history-raw.json
    python3 scripts/parse_owners.py <pdf folder> history-raw.json <site-data>/team_owners.json owner-aliases.json team-renames.json
    python3 scripts/build_history.py raw.json <site-data>/league.json <site-data>/history.json <site-data>/team_owners.json team-renames.json
    python3 scripts/lock_data.py <site-data> data "<league password>"

owner-aliases.json and team-renames.json hold real names and live in D:\Eric\Pinche\private.
The site shows first names only.  Every season is checked: each team's win-loss-tie is recomputed
from the game scores and must match RT's standings.

## Hosting
GitHub Pages from `main` (root), custom domain pinchegarcia.com via Cloudflare DNS.
