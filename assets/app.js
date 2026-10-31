// Pinche Garcia league site. Every page renders from data/league.json + data/history.json.
(function () {
  const PAGES = [
    { id: "home", href: "index.html", label: "Home" },
    { id: "history", href: "history.html", label: "History" },
    { id: "records", href: "records.html", label: "Record Book" },
    { id: "keepers", href: "keepers.html", label: "Keepers" },
    { id: "rules", href: "rules.html", label: "Rules" },
    { id: "owners", href: "owners.html", label: "Owners" }
  ];
  const page = document.body.dataset.page;
  // ---------- members-only lock: data files are AES-GCM encrypted with the league password ----------
  const KEY_STORE = "pg-key-v1";
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const enb64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
  let KEY = null;
  const open = async (sealed) => new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, KEY, unb64(sealed.ct)));
  const getRaw = async (name) => open(await (await fetch(`data/${name}.enc?t=${Date.now()}`, { cache: "no-store" })).json());
  const getData = async (name) => JSON.parse(await getRaw(name));
  async function deriveKey(pw, lock) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(lock.salt), iterations: lock.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  }
  async function keyWorks(k, lock) { try { KEY = k; return (await open(lock.check)) === "pinche"; } catch (e) { KEY = null; return false; } }
  async function unlock() {
    const lock = await (await fetch(`data/lock.json?t=${Date.now()}`, { cache: "no-store" })).json();
    let saved = null;
    try { saved = localStorage.getItem(KEY_STORE); } catch (e) {}
    if (saved) {
      try { if (await keyWorks(await crypto.subtle.importKey("raw", unb64(saved), "AES-GCM", true, ["decrypt"]), lock)) return; } catch (e) {}
      try { localStorage.removeItem(KEY_STORE); } catch (e) {}
    }
    await new Promise((done) => {
      document.body.classList.add("locked");
      const main = document.querySelector("main");
      main.innerHTML = `<form class="gate" id="gate" autocomplete="on">
          <img src="assets/logo.jpg" alt="" class="gate-logo">
          <h1>Pinche Garcia LLC</h1>
          <p>Members only.</p>
          <input type="text" name="username" value="pinche" autocomplete="username" hidden>
          <input id="gate-pw" type="password" name="password" placeholder="League password" autocomplete="current-password" required>
          <button type="submit">Enter</button>
          <p class="gate-msg" id="gate-msg" hidden></p>
        </form>`;
      const form = document.getElementById("gate"), msg = document.getElementById("gate-msg");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        msg.hidden = true; form.querySelector("button").disabled = true;
        const k = await deriveKey(document.getElementById("gate-pw").value, lock);
        if (await keyWorks(k, lock)) {
          try { localStorage.setItem(KEY_STORE, enb64(await crypto.subtle.exportKey("raw", k))); } catch (e2) {}
          document.body.classList.remove("locked"); main.innerHTML = ""; done();
        } else {
          msg.textContent = "That's not it.  Ask the commissioner."; msg.hidden = false;
          form.querySelector("button").disabled = false;
        }
      });
      document.getElementById("gate-pw").focus();
    });
  }
  const CH = "World Champion ";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gameYears = (h) => { const ys = imported(h).filter((s) => s.weeks.some((w) => w.games.length)).map((s) => +s.year); return [Math.min(...ys), Math.max(...ys)]; };
  const pts = (n) => (n == null ? "" : Number(n).toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }));
  const base = (n) => (n ? n.replace(/^(The)?World Champion /, (m, the) => (the ? "The " : "")) : n);
  const champName = (c) => (c.team ? base(c.team) : who(c.owner) || "");
  const pending = '<span class="pending">Not imported yet</span>';
  const seasonLink = (y, text) => `<a href="season.html#y${y}">${text ?? y}</a>`;

  function chrome(league) {
    const header = document.createElement("header");
    header.className = "site-header";
    header.innerHTML = `<div class="inner">
      <a class="brand" href="index.html"><img class="brand-logo" src="assets/logo.jpg" alt="Pinche Garcia LLC logo" width="52" height="52"><span>${esc(league.name)}<small>Fantasy Football &middot; Est. ${esc(league.established)}</small></span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
      <nav id="site-nav">${PAGES.map((p) => `<a href="${p.href}"${p.id === page || (page === "season" && p.id === "history") || (page === "h2h" && p.id === "records") || (page === "partners" && p.id === "owners") ? ' class="active"' : ""}>${p.label}</a>`).join("")}</nav>
    </div>`;
    document.body.prepend(header);
    // jump links land just below the pinned header (it is taller on phones)
    const setHdr = () => document.documentElement.style.setProperty("--hdr", header.offsetHeight + "px");
    setHdr(); addEventListener("resize", setHdr); addEventListener("load", setHdr);
    const t = document.getElementById("nav-toggle");
    t.onclick = () => { const open = header.classList.toggle("nav-open"); t.setAttribute("aria-expanded", open); };
    const footer = document.createElement("footer");
    footer.innerHTML = `${esc(league.format)}<br>&copy; ${new Date().getFullYear()} <a href="partners.html">Pinche Garcia LLC</a>.  All rights reserved.<br><span class="legal">For league members only.  No part of this site may be copied, shared or redistributed without the written consent of the partners.</span>`;
    document.body.append(footer);
  }

  // ---------- shared pieces ----------
  const ownerById = (data, id) => data.owners.find((o) => o.id === id);
  let WHO = {};  // owner id -> first name (current and former owners)
  const who = (id) => (id && WHO[id]) || "";
  const teamOwner = (s, team) => (s && s.owners ? s.owners[base(team)] : null);
  const tw = (s, team) => `${esc(base(team))}${who(teamOwner(s, team)) ? ` <span class="who">${esc(who(teamOwner(s, team)))}</span>` : ""}`;
  const imported = (h) => h.seasons.filter((s) => s.source === "archive");

  function allGames(h) {
    const out = [];
    imported(h).forEach((s) => s.weeks.forEach((w) => w.games.forEach(([a, as, b, bs]) =>
      out.push({ year: s.year, week: w.label, playoff: w.playoff, a, as, b, bs }))));
    return out;
  }

  function seasonCard(s) {
    const c = s.champion;
    const champ = c ? `<div class="value">${esc(champName(c))}${c.team && who(c.owner) ? ` <span class="who">${esc(who(c.owner))}</span>` : ""}</div>${c.score ? `<div class="sub">beat ${esc(base(c.runnerUp))}, ${pts(c.score[0])}&ndash;${pts(c.score[1])}</div>` : ""}` : pending;
    const most = s.mostPoints ? `<div class="value">${pts(s.mostPoints.points)}</div><div class="sub">${tw(s, s.mostPoints.team)}</div>` : pending;
    const high = s.highWeek ? `<div class="value">${pts(s.highWeek.points)}</div><div class="sub">${tw(s, s.highWeek.team)}</div>` : pending;
    const link = s.source === "archive" ? `<a class="card-link" href="season.html#y${s.year}">Full season &rarr;</a>` : "";
    return `<article class="card season-card"><h3>${s.year}</h3><div class="body">
      <div class="stat champ"><div class="label">Champion</div>${champ}</div>
      <div class="stat-row">
        <div class="stat"><div class="label">Most points</div>${most}</div>
        <div class="stat"><div class="label">Best week</div>${high}</div>
      </div>${link}</div></article>`;
  }

  function standingsTable(teams, opts = {}) {
    const rec = teams[0] && teams[0].w != null;
    const rows = teams.map((t, i) => `<tr${opts.mine === t.team ? ' class="mine"' : ""}>
      <td class="num rank">${t.rank ?? i + 1}</td>
      <td class="team">${esc(t.team)}${t.sub || who(t.owner) ? `<span class="owner-sub">${esc(t.sub || who(t.owner))}</span>` : ""}</td>
      ${rec ? `<td class="num">${t.w}-${t.l}${t.t ? "-" + t.t : ""}</td><td class="num hide-sm">${pts(t.pf)}</td><td class="num hide-sm">${pts(t.pa)}</td>` : ""}
    </tr>`).join("");
    const head = rec ? `<th class="num">#</th><th>Team</th><th class="num">Record</th><th class="num hide-sm">PF</th><th class="num hide-sm">PA</th>` : `<th class="num">#</th><th>Team</th>`;
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------- pages ----------
  const render = {
    home(data, h, el) {
      const cs = data.currentSeason;
      const last = h.seasons.find((s) => s.champion);
      const champOwner = last && last.champion.owner ? { first: who(last.champion.owner) } : null;
      const divs = data.league.divisions.slice().sort().map((d) => {
        const teams = data.owners.filter((o) => o.division === d)
          .sort((x, y) => base(x.team).localeCompare(base(y.team)))
          .map((o) => ({ team: o.team, sub: o.first }));
        return `<div><h3 class="div-title">${esc(d)} Division</h3><div class="table-wrap"><table class="div-list"><tbody>${teams.map((t) => `<tr><td class="team">${esc(t.team)}<span class="owner-sub">${esc(t.sub)}</span></td></tr>`).join("")}</tbody></table></div></div>`;
      }).join("");

      el.innerHTML = `
        ${last ? `<section class="champ-banner">
          <div class="trophy" aria-hidden="true">&#127942;</div>
          <div><div class="label">Defending Champion &middot; ${last.year}</div>
          <div class="champ-name">${esc(champName(last.champion))}</div>
          ${last.champion.score && last.champion.runnerUp ? `<div class="final-score">
            <div class="fs-row won"><span>${esc(base(last.champion.team))}</span><strong>${pts(last.champion.score[0])}</strong></div>
            <div class="fs-row"><span>${esc(base(last.champion.runnerUp))}</span><strong>${pts(last.champion.score[1])}</strong></div></div>` : ""}</div>
        </section>` : ""}
        <section><h2>${cs.year} Divisions</h2>
          <div class="two-col">${divs}</div></section>`;
    },

    history(data, h, el) {
      const rows = h.seasons.map((s) => {
        const c = s.champion;
        return `<tr><td class="num">${s.source === "archive" ? seasonLink(s.year) : s.year}</td>
          <td>${c ? `<strong>${esc(champName(c))}</strong>${c.team && who(c.owner) ? `<span class="owner-sub">${esc(who(c.owner))}</span>` : ""}` : pending}</td>
          <td class="hide-sm">${c && c.runnerUp ? `${esc(base(c.runnerUp))}${who(c.runnerUpOwner) ? `<span class="owner-sub">${esc(who(c.runnerUpOwner))}</span>` : ""}` : ""}</td>
          <td class="num hide-sm">${c && c.score ? `${pts(c.score[0])}&ndash;${pts(c.score[1])}` : ""}</td></tr>`;
      }).join("");
      el.innerHTML = `<h1>League History</h1>
        <nav class="subnav" aria-label="History sections"><a href="#champions">Champions</a><a href="#seasons">Seasons</a><a href="#h2h">Head-to-Head</a></nav>
        <h2 id="champions">Champions</h2>
        <div class="table-wrap"><table class="champ-table"><thead><tr><th class="num">Year</th><th>Champion</th><th class="hide-sm">Runner-up</th><th class="num hide-sm">Final</th></tr></thead><tbody>${rows}</tbody></table></div>
        <h2 id="seasons">Seasons</h2>
        <div class="grid">${h.seasons.filter((s) => s.source !== "missing").map(seasonCard).join("")}</div>
        <h2 id="h2h">Head-to-Head</h2>
        <div id="h2h-mount"></div>`;
      render.h2h(data, h, document.getElementById("h2h-mount"));
      if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
    },

    season(data, h, el) {
      const show = () => {
        const y = parseInt((location.hash.match(/\d{4}/) || [])[0], 10);
        const list = imported(h);
        const s = list.find((x) => x.year === y) || list[0];
        const i = list.indexOf(s);
        const prev = list[i + 1], next = list[i - 1];
        const c = s.champion;
        const reg = s.weeks.filter((w) => !w.playoff), po = s.weeks.filter((w) => w.playoff);
        const game = ([a, as, b, bs]) => {
          const aw = as > bs, bw = bs > as;
          const o = (t) => (who(teamOwner(s, t)) ? `<span class="owner-sub">${esc(who(teamOwner(s, t)))}</span>` : "");
          return `<div class="game"><span class="tm ${aw ? "win" : ""}">${esc(base(a))}${o(a)}</span><span class="sc ${aw ? "win" : ""}">${pts(as)}</span><span class="sc ${bw ? "win" : ""}">${pts(bs)}</span><span class="tm r ${bw ? "win" : ""}">${esc(base(b))}${o(b)}</span></div>`;
        };
        el.innerHTML = `
          <div class="season-nav">${prev ? `<a href="#y${prev.year}">&larr; ${prev.year}</a>` : "<span></span>"}<a href="history.html">All seasons</a>${next ? `<a href="#y${next.year}">${next.year} &rarr;</a>` : "<span></span>"}</div>
          <h1>${s.year} Season</h1>${s.leagueName ? `<p class="lead">Played as the ${esc(s.leagueName)}</p>` : ""}
          ${c ? `<section class="champ-banner"><div class="trophy" aria-hidden="true">&#127942;</div><div><div class="label">${s.year} Champion</div><div class="champ-name">${esc(champName(c))}</div>${c.score && c.runnerUp ? `<div class="final-score">
            <div class="fs-row won"><span>${esc(base(c.team))}</span><strong>${pts(c.score[0])}</strong></div>
            <div class="fs-row"><span>${esc(base(c.runnerUp))}</span><strong>${pts(c.score[1])}</strong></div></div>` : ""}</div></section>`
            : `<div class="banner">The ${s.year} championship game isn't in the RT Sports archive files. If you know who won, it gets added here.</div>`}
          <h2>Final Standings</h2>
          <div class="two-col">${s.divisions.map((d) => `<div><h3 class="div-title">${esc(d.name)} Division</h3>${standingsTable(d.teams)}</div>`).join("")}</div>
          ${po.length ? `<h2>Playoffs</h2><div class="weeks">${po.map((w) => `<div class="week open"><h3 class="div-title">${esc(w.label)}</h3>${w.games.map(game).join("")}</div>`).join("")}</div>` : ""}
          <h2>Weekly Results</h2>
          <div class="weeks">${reg.map((w) => `<details class="week"><summary>${esc(w.label)}</summary>${w.games.map(game).join("")}</details>`).join("")}</div>`;
        document.title = `${s.year} Season | ${data.league.name}`;
        window.scrollTo(0, 0);
      };
      window.addEventListener("hashchange", show);
      show();
    },

    records(data, h, el) {
      const g = allGames(h);
      const scores = g.flatMap((x) => [{ team: x.a, pts: x.as, year: x.year, week: x.week }, { team: x.b, pts: x.bs, year: x.year, week: x.week }]);
      const top = (arr, key, n = 10, asc = false) => [...arr].sort((p, q) => (asc ? p[key] - q[key] : q[key] - p[key])).slice(0, n);
      const blow = g.map((x) => ({ ...x, margin: Math.abs(x.as - x.bs), w: x.as > x.bs ? x.a : x.b, l: x.as > x.bs ? x.b : x.a, ws: Math.max(x.as, x.bs), ls: Math.min(x.as, x.bs) }));
      const combined = g.map((x) => ({ ...x, total: x.as + x.bs }));
      const seasonsPF = imported(h).flatMap((s) => s.divisions.flatMap((d) => d.teams.map((t) => ({ ...t, year: s.year, pct: (t.w + t.t / 2) / (t.w + t.l + t.t) }))));
      const T = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      const yw = (r) => `${seasonLink(r.year)} <span class="muted">${esc(r.week)}</span>`;
      const champCount = {};
      h.seasons.forEach((s) => { if (s.champion) { const n = s.champion.owner || base(s.champion.team); champCount[n] = (champCount[n] || []).concat(s.year); } });
      const titles = Object.entries(champCount).sort((a, b) => b[1].length - a[1].length || a[1][0] - b[1][0]);
      const sOf = (y) => h.seasons.find((x) => x.year === y);
      const notes = data.footnotes || [];
      el.innerHTML = `<div class="rb-head"><h1>Record Book</h1>${notes.length ? `<aside class="footnotes" aria-label="League footnotes"><div class="fn-title">League Footnotes</div><ol>${notes.map((n, i) => `<li><span class="fn-mark">${"*".repeat(i + 1)}</span>${esc(n)}</li>`).join("")}</ol></aside>` : ""}</div>
        <nav class="subnav subnav-8" aria-label="Record Book sections"><a href="#titles">Champions</a><a href="#high">High Scores</a><a href="#low">Low Scores</a><a href="#blowouts">Blowouts</a><a href="#shootouts">Big Games</a><a href="#toilet">Toilet Bowl</a><a href="#points">Most Points</a><a href="#best">Best Records</a></nav>
        
        <h2 id="titles">Championships</h2>${T('<th>Owner</th><th class="num">Titles</th><th>Years</th>', titles.map(([n, ys]) => `<tr><td>${esc(who(n) || n)}</td><td class="num">${ys.length}</td><td>${ys.sort().join(", ")}</td></tr>`).join(""))}
        <div class="two-col">
          <div><h2 id="high">Highest Scores</h2>${T('<th>Team</th><th class="num">Pts</th><th>When</th>', top(scores, "pts").map((r) => `<tr><td>${tw(sOf(r.year), r.team)}</td><td class="num">${pts(r.pts)}</td><td>${yw(r)}</td></tr>`).join(""))}</div>
          <div><h2 id="low">Lowest Scores</h2>${T('<th>Team</th><th class="num">Pts</th><th>When</th>', top(scores, "pts", 10, true).map((r) => `<tr><td>${tw(sOf(r.year), r.team)}</td><td class="num">${pts(r.pts)}</td><td>${yw(r)}</td></tr>`).join(""))}</div>
        </div>
        <h2 id="blowouts">Biggest Blowouts</h2>${T('<th>Winner</th><th class="num">Score</th><th class="hide-sm">Loser</th><th class="num">Margin</th><th>When</th>', top(blow, "margin").map((r) => `<tr><td>${tw(sOf(r.year), r.w)}</td><td class="num">${pts(r.ws)}&ndash;${pts(r.ls)}</td><td class="hide-sm">${tw(sOf(r.year), r.l)}</td><td class="num">${pts(r.margin)}</td><td>${yw(r)}</td></tr>`).join(""))}
        <h2 id="shootouts">Highest-Scoring Games</h2>${T('<th>Matchup</th><th class="num">Total</th><th>When</th>', top(combined, "total").map((r) => `<tr><td>${tw(sOf(r.year), r.a)} ${pts(r.as)}, ${tw(sOf(r.year), r.b)} ${pts(r.bs)}</td><td class="num">${pts(r.total)}</td><td>${yw(r)}</td></tr>`).join(""))}
        <h2 id="toilet">Toilet Bowl</h2>
        <div class="two-col">
          <div>${T('<th class="num">Year</th><th>Loser</th><th class="num">Score</th>', h.seasons.filter((s) => s.toiletBowl).map((s) => `<tr><td class="num">${seasonLink(s.year)}</td><td>${tw(s, s.toiletBowl.loser)}</td><td class="num">${pts(s.toiletBowl.score[0])}&ndash;${pts(s.toiletBowl.score[1])}</td></tr>`).join(""))}</div>
          <div>${T('<th>Owner</th><th class="num">Toilet bowls</th><th>Years</th>', Object.entries(h.seasons.filter((s) => s.toiletBowl).reduce((m, s) => { const o = s.toiletBowl.loserOwner; (m[o] = m[o] || []).push(s.year); return m; }, {})).sort((x, y) => y[1].length - x[1].length).map(([o, ys]) => `<tr><td>${esc(who(o))}</td><td class="num">${ys.length}</td><td>${ys.sort().join(", ")}</td></tr>`).join(""))}</div>
        </div>
        <div class="two-col">
          <div><h2 id="points">Most Points, Season</h2>${T('<th>Team</th><th class="num">PF</th><th class="num">Year</th>', top(seasonsPF, "pf").map((r) => `<tr><td>${tw(sOf(r.year), r.team)}</td><td class="num">${pts(r.pf)}</td><td class="num">${seasonLink(r.year)}</td></tr>`).join(""))}</div>
          <div><h2 id="best">Best Regular Season</h2>${T('<th>Team</th><th class="num">Record</th><th class="num">Year</th>', top(seasonsPF, "pct").map((r) => `<tr><td>${tw(sOf(r.year), r.team)}</td><td class="num">${r.w}-${r.l}${r.t ? "-" + r.t : ""}</td><td class="num">${seasonLink(r.year)}</td></tr>`).join(""))}</div>
        </div>`;
      if (location.hash) { const x = document.querySelector(location.hash); if (x) x.scrollIntoView(); }
    },

    h2h(data, h, el) {
      const [gy0, gy1] = gameYears(h);
      const T = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      el.innerHTML = `<p class="h2h-intro">Pick any two owners to see every game they played against each other.</p>
        <div class="h2h"><select id="h2h-a" aria-label="First owner"></select><span class="vs">vs</span><select id="h2h-b" aria-label="Second owner"></select></div>
        <div id="h2h-out"></div>
        <p class="h2h-note">Covers every game from ${gy0} through ${gy1}.  RT Sports kept no game scores before ${gy0}, so earlier seasons count toward championships but not head-to-head.</p>`;
      const all = [...data.owners, ...(data.formerOwners || [])];
      const opts = all.map((o) => `<option value="${esc(o.id)}">${esc(o.first)}</option>`).join("");
      const A = document.getElementById("h2h-a"), B = document.getElementById("h2h-b");
      A.innerHTML = '<option value="">Pick an owner</option>' + opts; B.innerHTML = '<option value="">Pick an owner</option>' + opts;
      const games = [];
      imported(h).forEach((s) => s.weeks.forEach((w) => w.games.forEach(([a1, as, b1, bs]) => {
        const oa = teamOwner(s, a1), ob = teamOwner(s, b1);
        if (oa && ob) games.push({ s, w, a1, as, b1, bs, oa, ob });
      })));
      const show = () => {
        const x = A.value, y = B.value, out = document.getElementById("h2h-out");
        if (!x || !y) { out.innerHTML = '<p class="pending">Pick two owners to see their all-time record.</p>'; return; }
        if (x === y) { out.innerHTML = '<p class="pending">Pick two different owners.</p>'; return; }
        const gs = games.filter((g) => (g.oa === x && g.ob === y) || (g.oa === y && g.ob === x)).map((g) => {
          const xs = g.oa === x ? g.as : g.bs, ys = g.oa === x ? g.bs : g.as;
          return { ...g, xs, ys, xt: g.oa === x ? g.a1 : g.b1, yt: g.oa === x ? g.b1 : g.a1 };
        });
        const rec = (list) => { let w = 0, l = 0, t = 0; list.forEach((g) => (g.xs > g.ys ? w++ : g.xs < g.ys ? l++ : t++)); return `${w}-${l}${t ? "-" + t : ""}`; };
        const reg = gs.filter((g) => !g.w.playoff), po = gs.filter((g) => g.w.playoff);
        if (!gs.length) { out.innerHTML = `<p class="pending">${esc(who(x))} and ${esc(who(y))} never played each other.</p>`; return; }
        out.innerHTML = `<div class="h2h-sum"><div><span>${esc(who(x))}</span><strong>${rec(gs)}</strong><em>all games</em></div><div><span>Regular season</span><strong>${rec(reg)}</strong></div><div><span>Playoffs</span><strong>${po.length ? rec(po) : "&ndash;"}</strong></div></div>
          ${T('<th class="num">Year</th><th>Week</th><th>' + esc(who(x)) + '</th><th class="num">Score</th><th class="hide-sm">' + esc(who(y)) + '</th>', gs.map((g) => `<tr><td class="num">${seasonLink(g.s.year)}</td><td>${esc(g.w.label.replace("Playoff Week", "Playoffs Wk"))}</td><td class="${g.xs > g.ys ? "win-t" : ""}">${esc(base(g.xt))}</td><td class="num">${pts(g.xs)}&ndash;${pts(g.ys)}</td><td class="hide-sm ${g.ys > g.xs ? "win-t" : ""}">${esc(base(g.yt))}</td></tr>`).join(""))}`;
      };
      A.onchange = B.onchange = show; show();
    },

    partners(data, h, el) {
      el.innerHTML = '<p class="pending">Loading partners...</p>';
      getData("partners").then((d) => {
        const rec = (id) => {
          const titles = h.seasons.filter((s) => s.champion && s.champion.owner === id).map((s) => s.year).sort();
          const finals = titles.filter((y) => y >= 2002).length + h.seasons.filter((s) => s.champion && s.champion.runnerUpOwner === id).length;
          let w = 0, l = 0, t = 0, n = 0;
          imported(h).forEach((s) => s.divisions.forEach((dv) => dv.teams.forEach((x) => { if (x.owner === id) { w += x.w; l += x.l; t += x.t; n++; } })));
          return { titles, finals, n, w, l, t };
        };
        const card = (p) => {
          const r = rec(p.owner);
          return `<article class="partner">
            <div class="p-name">${esc(who(p.owner))}</div>
            <div class="p-title">${esc(p.title)}</div>
            <dl class="p-cred">
              <div><dt>Championships</dt><dd>${r.titles.length}${r.titles.length ? ` <span>${r.titles.join(", ")}</span>` : ""}</dd></div>
              <div><dt>Finals</dt><dd>${r.finals}</dd></div>
              <div><dt>Career record</dt><dd>${r.n ? `${r.w}-${r.l}${r.t ? "-" + r.t : ""}` : "&ndash;"}</dd></div>
              <div><dt>Seasons on record</dt><dd>${r.n || "&ndash;"}</dd></div>
            </dl></article>`;
        };
        const tt = d.partners.concat(d.emeritus).reduce((s, p) => s + rec(p.owner).titles.length, 0);
        el.innerHTML = `<section class="firm">
            <div class="seal">PG<small>Est. ${d.founded}</small></div>
            <div><h1>${esc(d.firm)}</h1><p class="firm-tag">${esc(d.descriptor)}</p></div>
          </section>
          <div class="firm-facts"><div><strong>${h.seasons.filter((s) => s.champion).length}</strong><span>Seasons</span></div><div><strong>${d.partners.length}</strong><span>Partners</span></div><div><strong>${tt}</strong><span>Championships</span></div><div><strong>$200</strong><span>Salary cap</span></div></div>
          <p class="firm-overview">${esc(d.overview)}</p>
          <h2>Partners</h2><div class="partners">${d.partners.map(card).join("")}</div>
          <h2>Partners Emeritus</h2><div class="partners">${d.emeritus.map(card).join("")}</div>`;
      }).catch((e) => { el.textContent = "Could not load partners: " + e.message; });
    },

    owners(data, h, el) {
      const stats = (id) => {
        let w = 0, l = 0, t = 0, pf = 0;
        const years = [], names = new Map();
        imported(h).slice().reverse().forEach((s) => s.divisions.forEach((d) => d.teams.forEach((x) => {
          if (x.owner === id) { w += x.w; l += x.l; t += x.t; pf += x.pf; years.push(s.year); names.set(base(x.team), (names.get(base(x.team)) || []).concat(s.year)); }
        })));
        const titles = h.seasons.filter((s) => s.champion && s.champion.owner === id).map((s) => s.year).sort();
        const finals = h.seasons.filter((s) => s.champion && s.champion.runnerUpOwner === id).map((s) => s.year).sort();
        const bowls = h.seasons.filter((s) => s.toiletBowl && s.toiletBowl.loserOwner === id).map((s) => s.year).sort();
        const finish = [];
        imported(h).slice().reverse().forEach((s) => s.divisions.forEach((d) => d.teams.forEach((x) => { if (x.owner === id) finish.push({ y: s.year, f: x.finish, n: d.teams.length * s.divisions.length, champ: s.champion && s.champion.owner === id, bowl: s.toiletBowl && s.toiletBowl.loserOwner === id }); })));
        return { w, l, t, pf, years, names, titles, finals, bowls, finish };
      };
      const span = (ys) => { ys = ys.slice().sort((a, b) => a - b); const out = []; ys.forEach((y) => { const r = out[out.length - 1]; if (r && y === r[1] + 1) r[1] = y; else out.push([y, y]); }); return out.map(([a, b]) => (a === b ? a : `${a}&ndash;${b}`)).join(", "); };
      const card = (o, current) => {
        const s = stats(o.id);
        const pct = s.years.length ? ((s.w + s.t / 2) / (s.w + s.l + s.t)).toFixed(3).replace(/^0/, "") : "";
        return `<article class="card owner-card"><h3>${esc(o.first)}${s.titles.length ? ` <span class="rings">${"&#127942;".repeat(s.titles.length)}</span>` : ""}</h3><div class="body">
        ${current ? `<div class="stat"><div class="label">Current team</div><div class="value">${esc(base(o.team))}</div></div>` : ""}
        <div class="stat-row">
          <div class="stat"><div class="label">Championships</div><div class="value">${s.titles.length}</div>${s.titles.length ? `<div class="sub">${s.titles.join(", ")}</div>` : ""}</div>
          <div class="stat"><div class="label">Regular season</div>${s.years.length ? `<div class="value">${s.w}-${s.l}${s.t ? "-" + s.t : ""}</div><div class="sub">${pct} &middot; ${s.years.length} season${s.years.length > 1 ? "s" : ""}</div>` : pending}</div>
        </div>
        <div class="stat-row">
          <div class="stat"><div class="label">Finals record</div><div class="value">${s.titles.filter((y) => y >= 2002).length}-${s.finals.length}</div>${s.finals.length ? `<div class="sub">lost ${s.finals.join(", ")}</div>` : ""}</div>
          <div class="stat"><div class="label">Toilet bowls</div><div class="value">${s.bowls.length}</div>${s.bowls.length ? `<div class="sub">${s.bowls.join(", ")}</div>` : ""}</div>
        </div>
        ${s.finish.length ? `<div class="stat"><div class="label">Finish by season</div><div class="finish">${s.finish.map((f) => `<span class="fin${f.champ ? " champ" : ""}${f.bowl ? " bowl" : ""}" title="${f.y}: ${f.champ ? "Champion" : f.bowl ? "Toilet bowl" : "Regular season " + f.f + " of " + f.n}"><b>${String(f.y).slice(2)}</b>${f.champ ? "&#127942;" : f.bowl ? "&#128701;" : f.f}</span>`).join("")}</div></div>` : ""}
        <div class="stat"><div class="label">Team names</div><ul class="names">${[...s.names].map(([n, ys]) => `<li>${esc(n)} <span class="muted">${span(ys)}</span></li>`).join("")}</ul></div>
        </div></article>`;
      };
      el.innerHTML = `<div class="title-row"><h1>Owners</h1><a class="h2h-btn" href="partners.html"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Pinche Garcia LLC</a></div>
        ${data.league.divisions.map((d) => `<h2>${esc(d)} Division</h2><div class="grid">${data.owners.filter((o) => o.division === d).map((o) => card(o, true)).join("")}</div>`).join("")}
        <h2>Former Owners</h2><div class="grid">${(data.formerOwners || []).map((o) => card(o, false)).join("")}</div>`;
    },

    rules(data, h, el) {
      getRaw("rules").then((html) => { el.innerHTML = html; if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); } });
    },

    keepers(data, h, el) {
      el.innerHTML = '<p class="pending">Loading keepers...</p>';
      getData("keepers").then((d) => {
        const years = d.years.slice().sort((a, b) => b.year - a.year);
        const cur = years[0];
        const fmtDate = (s) => (s ? new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "");
        const block = (y, isCurrent) => {
          const teams = data.owners.map((o) => {
            const ks = y.keepers.filter((k) => k.owner === o.id);
            return `<article class="card keeper-card"><h3>${esc(o.first)}</h3><div class="body">
              <div class="sub team-line">${esc(base(o.team))}</div>
              ${ks.length ? `<ul class="keepers">${ks.map((k) => `<li><span class="pos pos-${esc(k.pos)}">${esc(k.pos)}</span><span class="pl">${esc(k.player)}${k.nfl ? `<span class="muted"> ${esc(k.nfl)}</span>` : ""}</span><span class="sal">${k.salary == null ? "$?" : "$" + k.salary}</span></li>`).join("")}</ul>`
                : `<p class="pending">${isCurrent ? "Not entered yet" : "No keepers recorded"}</p>`}
            </div></article>`;
          }).join("");
          const n = y.keepers.length;
          return `<section class="draft-year${isCurrent ? " current" : ""}">
            <h2>${isCurrent ? "By Team" : `${y.year} Keepers`} <span class="muted">${n} player${n === 1 ? "" : "s"} kept${y.draftDate ? ` &middot; auction ${esc(fmtDate(y.draftDate))}` : ""}</span></h2>
            ${y.note ? `<p class="note">${esc(y.note)}</p>` : ""}
            <div class="grid">${teams}</div></section>`;
        };
        const ph = cur.photo;
        el.innerHTML = `<div class="draft-hero${ph ? " has-photo" : ""}">
            <div class="draft-intro"><h1>${cur.year} Keepers</h1>
              <div class="keeper-rules"><h3>Auction League</h3><ul><li>10 teams &middot; Full PPR</li><li>$200 salary cap</li><li>Keep 2 players for $20, or 1 for any price</li></ul>
              <a href="rules.html#keepers">Keeper rules</a></div></div>
            ${ph ? `<a href="#" class="board-photo" id="board-photo"><img src="${esc(ph.src)}" alt="Handwritten ${cur.year} keeper list"></a>` : ""}
          </div>
          ${block(cur, true)}
          ${years.length > 1 ? `<h2 class="archive-title">Past Keepers</h2>${years.slice(1).map((y) => `<details class="past-year"><summary>${y.year}</summary>${block(y, false)}</details>`).join("")}` : ""}`;
              const bp = document.getElementById("board-photo");
        if (bp && ph) fetch(ph.src).then((r) => r.blob()).then((b) => { bp.href = URL.createObjectURL(b); bp.target = "_blank"; bp.rel = "noopener"; });
}).catch((e) => { el.textContent = "Could not load keeper data: " + e.message; });
    }
  };

  unlock().then(() => Promise.all([getData("league"), getData("history")]))
    .then(([data, hist]) => {
      const p = PAGES.find((x) => x.id === page);
      document.title = `${p ? p.label : page === "h2h" ? "Head-to-Head" : page === "partners" ? "Partners" : "Season"} | ${data.league.name}`;
      [...data.owners, ...(data.formerOwners || [])].forEach((o) => (WHO[o.id] = o.first));
      chrome(data.league);
      const main = document.querySelector("main");
      // league trophy photo in every champion box (kept inside the locked data)
      let trophy = null;
      const fillTrophies = () => main.querySelectorAll(".champ-banner .trophy:not(.has-img)").forEach((el) => {
        (trophy ||= getRaw("trophy").catch(() => null)).then((src) => {
          if (!src || el.classList.contains("has-img")) return;
          el.classList.add("has-img"); el.innerHTML = `<img src="${src}" alt="King Dick Cup">`;
        });
      });
      // every table sorts by clicking its column headings; sections with jump buttons get a "Top" link
      const cellKey = (td) => {
        const s = (td ? td.textContent : "").trim();
        const m = s.replace(/[$,]/g, "").match(/^[^\dA-Za-z-]*(-?\d+(?:\.\d+)?)/);
        return m ? { n: parseFloat(m[1]) } : { s: s.toLowerCase() };
      };
      const enhance = () => {
        main.querySelectorAll("table:not([data-sort])").forEach((tb) => {
          const ths = tb.querySelectorAll("thead th"), body = tb.tBodies[0];
          if (!ths.length || !body || body.rows.length < 2) return;
          tb.dataset.sort = "1";
          ths.forEach((th, col) => {
            th.classList.add("sortable"); th.tabIndex = 0; th.setAttribute("role", "button");
            th.insertAdjacentHTML("beforeend", '<span class="sort-ind" aria-hidden="true"></span>');
            const go = () => {
              const rows = [...body.rows], dir = th.dataset.dir === "asc" ? "desc" : th.dataset.dir === "desc" ? "asc" : null;
              const first = cellKey(rows[0].cells[col]);
              const d = dir || ("n" in first ? "desc" : "asc");
              const cmp = (dd) => (a, b) => {
                const x = cellKey(a.cells[col]), y = cellKey(b.cells[col]);
                const r = "n" in x && "n" in y ? x.n - y.n : "n" in x ? -1 : "n" in y ? 1 : x.s.localeCompare(y.s);
                return dd === "asc" ? r : -r;
              };
              let d2 = d, sorted = [...rows].sort(cmp(d));
              if (!dir && sorted.every((r, i) => r === rows[i])) { d2 = d === "asc" ? "desc" : "asc"; sorted = [...rows].sort(cmp(d2)); } // already in that order: flip
              rows.splice(0, rows.length, ...sorted);
              ths.forEach((h) => { delete h.dataset.dir; h.removeAttribute("aria-sort"); });
              th.dataset.dir = d2; th.setAttribute("aria-sort", d2 === "asc" ? "ascending" : "descending");
              body.append(...rows);
            };
            th.onclick = go; th.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
          });
        });
        if (main.querySelector(".subnav")) main.querySelectorAll("h2[id]:not([data-top])").forEach((h) => {
          h.dataset.top = "1";
          h.insertAdjacentHTML("beforeend", '<a class="to-top" href="#">Top &uarr;</a>');
          h.lastChild.onclick = (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); history.replaceState(null, "", location.pathname + location.search); };
        });
      };
      let queued = false;
      new MutationObserver(() => { fillTrophies(); if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; enhance(); }); } }).observe(main, { childList: true, subtree: true });
      render[page](data, hist, main);
      fillTrophies(); enhance();
    })
    .catch((e) => { document.querySelector("main").textContent = "Could not load league data: " + e.message; });
})();
