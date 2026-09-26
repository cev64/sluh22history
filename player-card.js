/* Player card: everything one player has done in this league.

   Opens over any page from an element carrying data-player="<encoded name>"
   (box score rows, a team's Starters list, the all-time Most-Started card)
   or from PlayerCard.open(name), which the all-time page's search calls.

   Reads boxscores/players.json (tools/boxscores/players.mjs) once, on first
   use. Styles are injected here so every page gets the same card without
   carrying a copy of them. Plain script, not a module, so it works from
   file:// like league-data.js. */
(function () {
  const NFL_LOGOS = new Set(["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET",
    "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT",
    "SEA", "SF", "TB", "TEN", "WSH"]);
  const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "K", "D/ST", "BE", "IR"];

  const CSS = `
  .pc-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(7, 18, 30, .55);
    opacity: 0; pointer-events: none; transition: opacity .18s ease;
  }
  .pc-backdrop.open { opacity: 1; pointer-events: auto; }

  .pc {
    --pc-ink: #0b1726; --pc-muted: #637083; --pc-line: #e3e8ee; --pc-soft: #f5f7fa;
    position: fixed; z-index: 201; left: 50%; top: 50%;
    width: min(940px, calc(100vw - 32px)); max-height: 92vh;
    transform: translate(-50%, -48%) scale(.98); opacity: 0; pointer-events: none;
    transition: opacity .18s ease, transform .18s ease;
    display: flex; flex-direction: column;
    background: var(--pc-soft); border-radius: 18px; overflow: hidden;
    box-shadow: 0 30px 80px rgba(7, 18, 30, .35);
    color: var(--pc-ink); font-size: 12px; line-height: 1.35;
  }
  .pc.open { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
  .pc-scroll { overflow: auto; overscroll-behavior: contain; }

  .pc-hero {
    position: relative; overflow: hidden;
    display: flex; align-items: center; gap: 18px;
    padding: 22px 64px 22px 24px;
    background: linear-gradient(120deg, var(--pc-color) 0%, color-mix(in srgb, var(--pc-color) 55%, #071827) 100%);
    color: #fff;
  }
  .pc-hero::after {
    content: ""; position: absolute; right: -60px; top: -80px; width: 260px; height: 260px;
    border-radius: 50%; background: rgba(255,255,255,.07);
  }
  .pc-photo {
    position: relative; flex: 0 0 auto; width: 96px; height: 96px; border-radius: 50%;
    background: rgba(255,255,255,.95); box-shadow: 0 0 0 4px rgba(255,255,255,.25);
    display: grid; place-items: center; overflow: visible;
  }
  .pc-photo > img.pc-face { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; object-position: top; }
  .pc-photo > img.pc-club-big { width: 70%; height: 70%; object-fit: contain; }
  .pc-photo .pc-club {
    position: absolute; right: -6px; bottom: -2px; width: 38px; height: 38px; border-radius: 50%;
    background: #fff; display: grid; place-items: center; box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  .pc-photo .pc-club img { width: 28px; height: 22px; object-fit: contain; }
  .pc-id { position: relative; z-index: 1; min-width: 0; }
  .pc-id h2 { margin: 0; font-size: 28px; line-height: 1.05; letter-spacing: -.02em; }
  .pc-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
  .pc-tag {
    padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,.16);
    font-size: 10.5px; font-weight: 800; letter-spacing: .03em;
  }
  .pc-close {
    position: absolute; z-index: 2; top: 16px; right: 16px; width: 36px; height: 36px;
    border: 1px solid rgba(255,255,255,.3); border-radius: 10px; background: rgba(255,255,255,.12);
    color: #fff; font-size: 22px; line-height: 1; cursor: pointer;
  }
  .pc-close:hover { background: rgba(255,255,255,.24); }

  .pc-body { padding: 16px; display: grid; gap: 14px; }

  .pc-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .pc-tile { background: #fff; border: 1px solid var(--pc-line); border-radius: 12px; padding: 10px 12px; }
  .pc-tile small { display: block; color: var(--pc-muted); font-size: 8.5px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .pc-tile strong { display: block; margin-top: 4px; font-size: 20px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .pc-tile span { display: block; margin-top: 2px; color: var(--pc-muted); font-size: 10px; }

  .pc-card { background: #fff; border: 1px solid var(--pc-line); border-radius: 14px; overflow: hidden; }
  .pc-card-head {
    display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
    padding: 11px 14px; border-bottom: 1px solid var(--pc-line);
  }
  .pc-card-head h3 { margin: 0; font-size: 13.5px; }
  .pc-card-head span { color: var(--pc-muted); font-size: 10px; }

  .pc-cols { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr); gap: 14px; align-items: start; }

  /* Ownership timeline: a strip per season, a cell per week, in the colour of
     whichever team had him that week. */
  .pc-tl-row {
    display: grid; grid-template-columns: 42px minmax(0, 1fr) 90px; gap: 10px; align-items: center;
    padding: 8px 14px; border-top: 1px solid #eef1f4;
  }
  .pc-tl-row:first-child { border-top: 0; }
  .pc-tl-year { font-weight: 900; font-size: 12px; }
  .pc-tl-strip { display: grid; grid-template-columns: repeat(var(--weeks), 1fr); gap: 2px; }
  .pc-wk { height: 18px; border-radius: 3px; background: #f1f4f7; }
  .pc-wk.start { background: var(--c); }
  .pc-wk.bench { background: #fff; box-shadow: inset 0 0 0 1.5px var(--c); }
  .pc-wk.none { background: transparent; }
  .pc-wk.po { margin-left: 4px; }
  .pc-tl-who { display: flex; justify-content: flex-end; gap: 3px; }
  .pc-tl-who .pc-mark { width: 22px; height: 22px; }
  .pc-tl-key { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 9px 14px; border-top: 1px solid #eef1f4; color: var(--pc-muted); font-size: 10px; }
  .pc-tl-key i { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; margin-right: 5px; }

  .pc-mark {
    flex: 0 0 auto; width: 28px; height: 28px; border-radius: 8px; overflow: hidden;
    display: grid; place-items: center; background: var(--c); color: #fff; font-weight: 900; font-size: 11px;
    box-shadow: 0 0 0 1px rgba(0,0,0,.06);
  }
  .pc-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }

  .pc-mgr {
    display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 10px; align-items: center;
    padding: 9px 14px; border-top: 1px solid #eef1f4;
  }
  .pc-mgr:first-child { border-top: 0; }
  .pc-mgr-name strong { display: block; font-size: 12.5px; }
  .pc-mgr-name span { display: block; color: var(--pc-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pc-mgr-nums { display: flex; gap: 14px; text-align: right; font-variant-numeric: tabular-nums; }
  .pc-mgr-nums b { display: block; font-size: 13px; }
  .pc-mgr-nums small { display: block; color: var(--pc-muted); font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
  .pc-bar { grid-column: 2 / -1; height: 4px; border-radius: 2px; background: #eef1f4; overflow: hidden; margin-top: -4px; }
  .pc-bar i { display: block; height: 100%; background: var(--c); }

  /* The best game leads across the full width, the next four in a 2×2. */
  .pc-top { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px; }
  .pc-top .pc-game:first-child { grid-column: 1 / -1; }
  .pc-top .pc-game:first-child b { font-size: 30px; }
  .pc-game {
    position: relative; border-radius: 12px; padding: 10px; color: #fff; overflow: hidden;
    background: linear-gradient(150deg, var(--c), color-mix(in srgb, var(--c) 60%, #071827));
  }
  .pc-game .pc-rank { position: absolute; right: 8px; top: 6px; font-size: 22px; font-weight: 900; opacity: .25; }
  .pc-game b { display: block; font-size: 22px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .pc-game small { display: block; font-size: 9.5px; opacity: .85; }
  .pc-game span { display: block; margin-top: 6px; font-size: 10px; font-weight: 700; line-height: 1.3; }

  .pc-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 10px 14px; border-bottom: 1px solid var(--pc-line); scrollbar-width: none; }
  .pc-tabs button {
    flex: 0 0 auto; border: 1px solid var(--pc-line); background: #fff; color: var(--pc-ink);
    border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer;
  }
  .pc-tabs button.active { background: var(--pc-ink); border-color: var(--pc-ink); color: #fff; }

  .pc-log { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .pc-log th {
    padding: 7px 8px; background: #f6f8fa; color: #788696; text-align: left;
    font-size: 8.5px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase;
  }
  .pc-log td { padding: 7px 8px; border-top: 1px solid #eef1f4; font-size: 11.5px; white-space: nowrap; }
  .pc-log .num { text-align: right; }
  .pc-log tr.bench td { color: var(--pc-muted); }
  .pc-log tr.bench td.pts b { font-weight: 600; }
  .pc-log .pc-team { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .pc-log .pc-team .pc-mark { width: 20px; height: 20px; border-radius: 6px; font-size: 8px; }
  .pc-log .pc-team span { overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
  .pc-slot { display: inline-block; min-width: 34px; padding: 2px 5px; border-radius: 5px; background: #eef1f4; font-size: 9px; font-weight: 900; text-align: center; color: #4b5866; }
  .pc-res { display: inline-block; width: 18px; height: 18px; border-radius: 5px; color: #fff; font-size: 9.5px; font-weight: 900; text-align: center; line-height: 18px; }
  .pc-res.w { background: #16834a; } .pc-res.l { background: #c73535; } .pc-res.t { background: #8693a1; }
  .pc-diff.up { color: #16834a; } .pc-diff.down { color: #c73535; }
  .pc-log img.pc-nfl { width: 22px; height: 16px; object-fit: contain; vertical-align: middle; }
  .pc-chip { display: inline-block; padding: 1px 4px; border-radius: 4px; background: #e7ebef; color: #4b5866; font-size: 8px; font-weight: 900; }
  .pc-note { padding: 9px 14px; color: var(--pc-muted); font-size: 10px; border-top: 1px solid var(--pc-line); background: #fafbfc; }
  .pc-empty { padding: 40px; text-align: center; color: var(--pc-muted); }

  [data-player] { cursor: pointer; }
  .bx-name[data-player]:hover, .roster-name[data-player]:hover strong, .starters-name[data-player]:hover strong { text-decoration: underline; text-underline-offset: 2px; }

  @media (max-width: 760px) {
    .pc {
      left: 0; top: auto; bottom: 0; width: 100%; max-height: 94dvh;
      border-radius: 18px 18px 0 0; transform: translateY(24px);
    }
    .pc.open { transform: none; }
    .pc-hero { padding: 18px 56px 18px 16px; gap: 14px; }
    .pc-photo { width: 72px; height: 72px; }
    .pc-photo .pc-club { width: 30px; height: 30px; }
    .pc-photo .pc-club img { width: 22px; height: 17px; }
    .pc-id h2 { font-size: 21px; }
    .pc-tag { font-size: 9.5px; }
    .pc-body { padding: 10px; gap: 10px; }
    .pc-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .pc-tile strong { font-size: 17px; }
    .pc-cols { grid-template-columns: 1fr; gap: 10px; }
    .pc-tl-row { grid-template-columns: 34px minmax(0, 1fr); padding: 8px 10px; row-gap: 5px; }
    .pc-tl-who { grid-column: 2; justify-content: flex-start; }
    .pc-tl-who .pc-mark { width: 18px; height: 18px; border-radius: 5px; }
    .pc-wk { height: 15px; border-radius: 2px; }
    .pc-tl-strip { gap: 1px; }
    .pc-wk.po { margin-left: 2px; }
    .pc-top { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 44%; overflow-x: auto; padding: 10px; scroll-snap-type: x mandatory; }
    .pc-top .pc-game:first-child { grid-column: auto; }
    .pc-top .pc-game:first-child b { font-size: 22px; }
    .pc-game { scroll-snap-align: start; }
    .pc-mgr { padding: 9px 10px; }
    .pc-mgr-nums { gap: 10px; }
    .pc-log .hide-sm { display: none; }
    .pc-log td, .pc-log th { padding: 7px 5px; }
    .pc-log .pc-team span { max-width: 88px; }
  }`;

  let data = null;
  let loading = null;
  let els = null;
  let lastFocus = null;

  const fmt = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt1 = (n) => Number(n).toFixed(1);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function load() {
    if (!loading) {
      loading = fetch("boxscores/players.json")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json) json.byName = new Map(json.players.map((p) => [p.n, p]));
          data = json;
          return json;
        })
        .catch(() => null);
    }
    return loading;
  }

  function nfl(abbr, cls = "pc-nfl") {
    return NFL_LOGOS.has(abbr)
      ? `<img class="${cls}" src="nfl-logos/${abbr}.png" alt="${abbr}" title="${abbr}">`
      : `<span class="pc-chip">${abbr || "FA"}</span>`;
  }

  // A fantasy team's mark: the manager's logo when the page has team-logos.js,
  // otherwise the team's colour with its initial.
  function mark(team) {
    const src = window.TEAM_LOGOS && window.TEAM_LOGOS[team.ownerId];
    return `<span class="pc-mark" style="--c:${team.color}" title="${esc(team.name)} · ${esc(team.owner)}">${
      src ? `<img src="${src}" alt="">` : esc(team.name.trim().charAt(0))}</span>`;
  }

  function teamOf(season, id) {
    const t = data.teams[season] && data.teams[season][id];
    return t ? { id, name: t[0], ownerId: t[1], owner: t[2], color: t[3] } : { id, name: id, ownerId: id, owner: "", color: "#8693a1" };
  }

  function ensureShell() {
    if (els) return els;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const backdrop = document.createElement("div");
    backdrop.className = "pc-backdrop";
    const card = document.createElement("div");
    card.className = "pc";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-hidden", "true");
    card.setAttribute("aria-labelledby", "pcName");
    document.body.append(backdrop, card);
    backdrop.addEventListener("click", close);
    els = { backdrop, card };
    return els;
  }

  function close() {
    if (!els || !els.card.classList.contains("open")) return;
    els.card.classList.remove("open");
    els.backdrop.classList.remove("open");
    els.card.setAttribute("aria-hidden", "true");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function build(p) {
    const rows = p.r.map(([season, week, teamId, slot, pts, proj, club]) => {
      const game = ((data.games[season] || {})[week] || {})[teamId];
      const started = slot !== "BE" && slot !== "IR";
      let result = null;
      if (game) result = game[1] > game[2] ? "W" : game[1] < game[2] ? "L" : "T";
      return { season, week, team: teamOf(season, teamId), slot, pts, proj, club, started, game, result,
        playoff: week > (data.regularWeeks[season] || 14) };
    });
    const starts = rows.filter((r) => r.started);
    const bench = rows.filter((r) => r.slot === "BE");
    const total = starts.reduce((t, r) => t + r.pts, 0);
    const best = starts.slice().sort((a, b) => b.pts - a.pts);
    const beat = starts.filter((r) => r.proj > 0 && r.pts >= r.proj).length;
    const withProj = starts.filter((r) => r.proj > 0).length;
    const wins = starts.filter((r) => r.result === "W").length;
    const losses = starts.filter((r) => r.result === "L").length;

    // Managers, most starts first; a manager keeps his history through renames.
    const mgrs = new Map();
    for (const r of rows) {
      const m = mgrs.get(r.team.ownerId) || { ...r.team, names: new Set(), seasons: new Set(), starts: 0, pts: 0, w: 0, l: 0, weeks: 0 };
      m.names.add(r.team.name);
      m.seasons.add(r.season);
      m.weeks++;
      if (r.started) { m.starts++; m.pts += r.pts; if (r.result === "W") m.w++; if (r.result === "L") m.l++; }
      m.color = r.team.color;
      mgrs.set(r.team.ownerId, m);
    }
    const managers = [...mgrs.values()].sort((a, b) => b.starts - a.starts || b.weeks - a.weeks);
    const seasons = [...new Set(rows.map((r) => r.season))];
    const lastClub = rows[rows.length - 1].club;
    return { rows, starts, bench, total, best, beat, withProj, wins, losses, managers, seasons, lastClub };
  }

  function render(name) {
    const { card } = ensureShell();
    const p = data && data.byName.get(name);
    if (!p) {
      card.style.setProperty("--pc-color", "#304f91");
      card.innerHTML = `<button class="pc-close" aria-label="Close">&times;</button><div class="pc-empty">${data ? `No league history for ${esc(name)}.` : "Player history could not be loaded."}</div>`;
      card.querySelector(".pc-close").addEventListener("click", close);
      return;
    }

    const s = build(p);
    const lead = s.managers[0];
    const isDst = p.p === "DST";
    const span = s.seasons.length > 1 ? `${s.seasons[0]}–${s.seasons[s.seasons.length - 1]}` : `${s.seasons[0]}`;
    const photo = !isDst && p.h
      ? `<img class="pc-face" src="https://sleepercdn.com/content/nfl/players/thumb/${p.h}.jpg" alt="">`
      : NFL_LOGOS.has(s.lastClub) ? `<img class="pc-club-big" src="nfl-logos/${s.lastClub}.png" alt="">` : "";
    const avg = s.starts.length ? s.total / s.starts.length : 0;
    const top = s.best[0];

    // Timeline: every week of every season he was on a roster. Every row
    // shares one grid, as wide as the longest season, so a season still in
    // progress stays short instead of stretching two weeks across the card.
    const lastOf = (season) => Math.max(...Object.keys(data.games[season] || {}).map(Number));
    const columns = Math.max(...s.seasons.map(lastOf));
    const timeline = s.seasons.map((season) => {
      const inSeason = s.rows.filter((r) => r.season === season);
      const lastWeek = Math.max(lastOf(season), ...inSeason.map((r) => r.week));
      const reg = data.regularWeeks[season] || 14;
      const byWeek = new Map(inSeason.map((r) => [r.week, r]));
      const cells = Array.from({ length: lastWeek }, (_, i) => {
        const w = i + 1;
        const r = byWeek.get(w);
        const po = w === reg + 1 ? " po" : "";
        if (!r) {
          // A week his last team had no game (a playoff bye, or knocked out)
          // is blank rather than "not on a roster".
          const before = inSeason.filter((x) => x.week < w).pop();
          const idle = before && !((data.games[season] || {})[w] || {})[before.team.id];
          return idle
            ? `<span class="pc-wk none${po}" title="${season} week ${w}: ${esc(before.team.name)} had no game"></span>`
            : `<span class="pc-wk${po}" title="${season} week ${w}: not on a roster"></span>`;
        }
        const cls = r.started ? "start" : "bench";
        return `<span class="pc-wk ${cls}${po}" style="--c:${r.team.color}" title="${season} week ${w}: ${esc(r.team.name)} · ${r.started ? r.slot : r.slot === "IR" ? "IR" : "bench"} · ${fmt(r.pts)}"></span>`;
      }).join("");
      const who = [...new Map(inSeason.map((r) => [r.team.ownerId, r.team])).values()].map(mark).join("");
      return `<div class="pc-tl-row"><span class="pc-tl-year">${season}</span>
        <span class="pc-tl-strip" style="--weeks:${columns}">${cells}</span>
        <span class="pc-tl-who">${who}</span></div>`;
    }).join("");

    const mostStarts = Math.max(1, ...s.managers.map((m) => m.starts));
    const managers = s.managers.map((m) => `
      <div class="pc-mgr" style="--c:${m.color}">
        ${mark(m)}
        <span class="pc-mgr-name"><strong>${esc(m.owner)}</strong><span>${[...m.names].map(esc).join(" · ")} · ${[...m.seasons].join(", ")}</span></span>
        <span class="pc-mgr-nums">
          <span><b>${m.starts}</b><small>GS</small></span>
          <span><b>${fmt1(m.pts)}</b><small>Pts</small></span>
          <span><b>${m.w}–${m.l}</b><small>Rec</small></span>
        </span>
        <span class="pc-bar"><i style="width:${(100 * m.starts / mostStarts).toFixed(1)}%"></i></span>
      </div>`).join("");

    const topGames = s.best.slice(0, 5).map((r, i) => {
      const opp = r.game ? teamOf(r.season, r.game[0]) : null;
      return `<div class="pc-game" style="--c:${r.team.color}">
        <span class="pc-rank">${i + 1}</span>
        <b>${fmt(r.pts)}</b>
        <small>${r.season} · Week ${r.week}${r.playoff && r.game && r.game[3] ? ` · ${esc(r.game[3])}` : ""}</small>
        <span>${esc(r.team.name)}${opp ? ` vs ${esc(opp.name)}` : ""}${r.result ? ` · ${r.result}` : ""}</span>
      </div>`;
    }).join("");

    card.style.setProperty("--pc-color", lead ? lead.color : "#304f91");
    card.innerHTML = `
      <div class="pc-scroll">
        <header class="pc-hero">
          <div class="pc-photo">${photo}${!isDst ? `<span class="pc-club">${nfl(s.lastClub)}</span>` : ""}</div>
          <div class="pc-id">
            <h2 id="pcName">${esc(p.n)}</h2>
            <div class="pc-tags">
              <span class="pc-tag">${p.p}</span>
              <span class="pc-tag">${span}</span>
              <span class="pc-tag">${s.managers.length} manager${s.managers.length === 1 ? "" : "s"}</span>
              <span class="pc-tag">${s.rows.length} week${s.rows.length === 1 ? "" : "s"} rostered</span>
            </div>
          </div>
          <button type="button" class="pc-close" aria-label="Close player card">&times;</button>
        </header>
        <div class="pc-body">
          <section class="pc-tiles">
            <div class="pc-tile"><small>Starts</small><strong>${s.starts.length}</strong><span>${s.bench.length} on the bench</span></div>
            <div class="pc-tile"><small>Points as a starter</small><strong>${fmt1(s.total)}</strong><span>${fmt(avg)} a start</span></div>
            <div class="pc-tile"><small>Best game</small><strong>${top ? fmt(top.pts) : "—"}</strong><span>${top ? `${top.season} wk ${top.week} · ${esc(top.team.name)}` : "Never started"}</span></div>
            <div class="pc-tile"><small>Record when started</small><strong>${s.wins}–${s.losses}</strong><span>his fantasy team's result</span></div>
            <div class="pc-tile"><small>Beat projection</small><strong>${s.withProj ? Math.round(100 * s.beat / s.withProj) + "%" : "—"}</strong><span>${s.beat} of ${s.withProj} starts</span></div>
            <div class="pc-tile"><small>Left on the bench</small><strong>${fmt1(s.bench.reduce((t, r) => t + r.pts, 0))}</strong><span>points while benched</span></div>
            <div class="pc-tile"><small>Seasons</small><strong>${s.seasons.length}</strong><span>${s.seasons.join(", ")}</span></div>
            <div class="pc-tile"><small>Fantasy teams</small><strong>${new Set(s.rows.map((r) => r.season + r.team.id)).size}</strong><span>${s.managers.length} different manager${s.managers.length === 1 ? "" : "s"}</span></div>
          </section>

          <section class="pc-card">
            <div class="pc-card-head"><h3>Ownership timeline</h3><span>One cell per week</span></div>
            ${timeline}
            <div class="pc-tl-key">
              <span><i style="background:${lead ? lead.color : "#304f91"}"></i>Started, in that team's colour</span>
              <span><i style="box-shadow: inset 0 0 0 1.5px ${lead ? lead.color : "#304f91"}"></i>Bench</span>
              <span><i style="background:#f1f4f7"></i>Not on a roster</span>
              <span>Playoff weeks sit apart; a gap is a week his team had no game</span>
            </div>
          </section>

          <div class="pc-cols">
            <section class="pc-card">
              <div class="pc-card-head"><h3>By manager</h3><span>Starts · points · record</span></div>
              ${managers}
            </section>
            <section class="pc-card">
              <div class="pc-card-head"><h3>Top performances</h3><span>As a starter</span></div>
              ${topGames ? `<div class="pc-top">${topGames}</div>` : `<div class="pc-empty">Never started.</div>`}
            </section>
          </div>

          <section class="pc-card">
            <div class="pc-card-head"><h3>Game log</h3><span>Every week on a roster</span></div>
            <div class="pc-tabs" role="tablist">${s.seasons.map((y, i) =>
              `<button type="button" role="tab" data-season="${y}" class="${i === s.seasons.length - 1 ? "active" : ""}">${y}</button>`).join("")}
              <button type="button" role="tab" data-season="all">All</button></div>
            <div class="pc-log-wrap"></div>
            <div class="pc-note">Result is his fantasy team's. Bench and IR weeks are greyed; their points did not count.</div>
          </section>
        </div>
      </div>`;

    // A photo Sleeper no longer serves falls back to his club's logo.
    const face = card.querySelector(".pc-face");
    if (face) face.addEventListener("error", () => {
      face.outerHTML = NFL_LOGOS.has(s.lastClub) ? `<img class="pc-club-big" src="nfl-logos/${s.lastClub}.png" alt="">` : "";
    });

    const logWrap = card.querySelector(".pc-log-wrap");
    const showLog = (season) => {
      const list = s.rows.filter((r) => season === "all" || r.season === Number(season)).slice().reverse();
      logWrap.innerHTML = `<table class="pc-log"><thead><tr>
          ${season === "all" ? "<th>Yr</th>" : ""}<th>Wk</th><th>Team</th><th class="hide-sm">Opponent</th><th>Slot</th>
          <th class="num">Pts</th><th class="num hide-sm">Proj</th><th class="num hide-sm">+/-</th><th class="hide-sm">NFL</th><th>Res</th>
        </tr></thead><tbody>${list.map((r) => {
          const opp = r.game ? teamOf(r.season, r.game[0]) : null;
          const diff = r.pts - r.proj;
          const label = r.playoff && r.game && r.game[3] ? ` title="${esc(r.game[3])}"` : "";
          return `<tr class="${r.started ? "" : "bench"}">
            ${season === "all" ? `<td>${r.season}</td>` : ""}
            <td${label}>${r.week}${r.playoff ? "<sup>P</sup>" : ""}</td>
            <td><span class="pc-team">${mark(r.team)}<span>${esc(r.team.name)}</span></span></td>
            <td class="hide-sm">${opp ? esc(opp.name) : "—"}</td>
            <td><span class="pc-slot">${r.slot}</span></td>
            <td class="num pts"><b>${fmt(r.pts)}</b></td>
            <td class="num hide-sm">${fmt(r.proj)}</td>
            <td class="num hide-sm"><span class="pc-diff ${r.started ? (diff >= 0 ? "up" : "down") : ""}">${diff >= 0 ? "+" : ""}${fmt(diff)}</span></td>
            <td class="hide-sm">${nfl(r.club)}</td>
            <td>${r.result && r.started ? `<span class="pc-res ${r.result.toLowerCase()}">${r.result}</span>` : ""}</td>
          </tr>`;
        }).join("")}</tbody></table>`;
      card.querySelectorAll(".pc-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.season === String(season)));
    };
    showLog(s.seasons[s.seasons.length - 1]);
    card.querySelector(".pc-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-season]");
      if (b) showLog(b.dataset.season);
    });
    card.querySelector(".pc-close").addEventListener("click", close);
  }

  function open(name) {
    const { card, backdrop } = ensureShell();
    lastFocus = document.activeElement;
    card.innerHTML = `<div class="pc-empty">Loading…</div>`;
    card.classList.add("open");
    backdrop.classList.add("open");
    card.setAttribute("aria-hidden", "false");
    load().then(() => {
      render(name);
      const btn = card.querySelector(".pc-close");
      if (btn) btn.focus();
      const scroller = card.querySelector(".pc-scroll");
      if (scroller) scroller.scrollTop = 0;
    });
  }

  /* Search: names containing every word typed, in any order, accents and
     punctuation ignored; the most-started first. */
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.'’]/g, "");
  function search(query, limit = 8) {
    return load().then((d) => {
      if (!d) return [];
      const words = norm(query).split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      return d.players
        .filter((p) => { const n = norm(p.n); return words.every((w) => n.includes(w)); })
        .map((p) => {
          const starts = p.r.filter((r) => r[3] !== "BE" && r[3] !== "IR");
          return { name: p.n, pos: p.p, club: p.r[p.r.length - 1][6], headshot: p.h,
            starts: starts.length, pts: starts.reduce((t, r) => t + r[4], 0),
            seasons: [...new Set(p.r.map((r) => r[0]))], prefix: norm(p.n).startsWith(words[0]) };
        })
        .sort((a, b) => (b.prefix - a.prefix) || b.starts - a.starts || a.name.localeCompare(b.name))
        .slice(0, limit);
    });
  }

  document.addEventListener("click", (event) => {
    const el = event.target.closest && event.target.closest("[data-player]");
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    open(decodeURIComponent(el.dataset.player));
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!els || !els.card.classList.contains("open")) {
      const el = event.target.closest && event.target.closest("[data-player]");
      if (el && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();
        open(decodeURIComponent(el.dataset.player));
      }
      return;
    }
    if (event.key === "Escape") {
      // Close only the card, not the box score or drawer underneath it.
      event.stopImmediatePropagation();
      event.preventDefault();
      close();
    }
  }, true);

  window.PlayerCard = { open, close, search, nflLogo: nfl };
})();
