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
    width: min(900px, calc(100vw - 32px)); max-height: 92vh;
    transform: translate(-50%, -48%) scale(.98); opacity: 0; pointer-events: none;
    transition: opacity .18s ease, transform .18s ease;
    display: flex; flex-direction: column;
    background: var(--pc-soft); border-radius: 18px; overflow: hidden;
    box-shadow: 0 30px 80px rgba(7, 18, 30, .35);
    color: var(--pc-ink); font-size: 12px; line-height: 1.35;
    -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
  }
  .pc.open { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
  .pc *, .pc *::before, .pc *::after { box-sizing: border-box; }
  .pc-scroll { overflow: auto; overscroll-behavior: contain; }

  .pc-hero {
    position: relative; overflow: hidden;
    display: flex; align-items: center; gap: 16px;
    padding: 20px 60px 20px 22px;
    background: linear-gradient(120deg, var(--pc-color) 0%, color-mix(in srgb, var(--pc-color) 55%, #071827) 100%);
    color: #fff;
  }
  .pc-hero::after {
    content: ""; position: absolute; right: -60px; top: -80px; width: 240px; height: 240px;
    border-radius: 50%; background: rgba(255,255,255,.07);
  }
  .pc-photo {
    position: relative; flex: 0 0 auto; width: 84px; height: 84px; border-radius: 50%;
    background: rgba(255,255,255,.95); box-shadow: 0 0 0 4px rgba(255,255,255,.25);
    display: grid; place-items: center;
  }
  .pc-photo > img.pc-face { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; object-position: top; }
  .pc-photo > img.pc-club-big { width: 70%; height: 70%; object-fit: contain; }
  .pc-photo .pc-club {
    position: absolute; right: -5px; bottom: -2px; width: 34px; height: 34px; border-radius: 50%;
    background: #fff; display: grid; place-items: center; box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  .pc-photo .pc-club img { width: 25px; height: 19px; object-fit: contain; }
  .pc-id { position: relative; z-index: 1; min-width: 0; }
  .pc-id h2 { margin: 0; font-size: 26px; line-height: 1.05; letter-spacing: -.02em; }
  .pc-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pc-tag {
    padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,.16);
    font-size: 10.5px; font-weight: 800; letter-spacing: .03em;
  }
  .pc-close {
    position: absolute; z-index: 2; top: 14px; right: 14px; width: 34px; height: 34px;
    border: 1px solid rgba(255,255,255,.3); border-radius: 10px; background: rgba(255,255,255,.12);
    color: #fff; font-size: 21px; line-height: 1; cursor: pointer;
  }
  .pc-close:hover { background: rgba(255,255,255,.24); }

  .pc-body { padding: 14px; display: grid; gap: 12px; }

  .pc-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .pc-tile { background: #fff; border: 1px solid var(--pc-line); border-radius: 12px; padding: 10px 12px; min-width: 0; }
  .pc-tile small { display: block; color: var(--pc-muted); font-size: 8.5px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .pc-tile strong { display: block; margin-top: 4px; font-size: 21px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .pc-tile span { display: block; margin-top: 2px; color: var(--pc-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .pc-card { background: #fff; border: 1px solid var(--pc-line); border-radius: 14px; overflow: hidden; }
  .pc-card-head {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 14px; border-bottom: 1px solid var(--pc-line);
  }
  .pc-card-head h3 { margin: 0; font-size: 13.5px; display: flex; align-items: center; gap: 7px; }
  .pc-card-head > span { color: var(--pc-muted); font-size: 10px; }

  .pc-cols { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 12px; align-items: start; }

  /* Ownership timeline: a strip per season, a cell per week, in the colour of
     whichever team had him that week, and that team's logo at the end. */
  .pc-tl-row {
    display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 10px; align-items: center;
    padding: 7px 14px; border-top: 1px solid #eef1f4;
  }
  .pc-tl-row:first-child { border-top: 0; }
  .pc-tl-year { font-weight: 900; font-size: 12px; }
  .pc-tl-strip { display: grid; grid-template-columns: repeat(var(--weeks), 1fr); gap: 2px; }
  .pc-wk { height: 16px; border-radius: 3px; background: #f1f4f7; }
  .pc-wk.start { background: var(--c); }
  .pc-wk.bench { background: #fff; box-shadow: inset 0 0 0 1.5px var(--c); }
  .pc-wk.none { background: transparent; }
  .pc-wk.po { margin-left: 4px; }
  .pc-tl-who { display: flex; justify-content: flex-end; gap: 3px; min-width: 22px; }
  .pc-tl-who .pc-mark { width: 22px; height: 22px; border-radius: 6px; }
  .pc-tl-key { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 8px 14px; border-top: 1px solid #eef1f4; color: var(--pc-muted); font-size: 10px; }
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
  .pc-mgr-name { min-width: 0; }
  .pc-mgr-name strong { display: block; font-size: 12.5px; }
  .pc-mgr-name span { display: block; color: var(--pc-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pc-mgr-nums { display: flex; gap: 14px; text-align: right; font-variant-numeric: tabular-nums; }
  .pc-mgr-nums b { display: block; font-size: 13px; }
  .pc-mgr-nums small { display: block; color: var(--pc-muted); font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
  .pc-bar { grid-column: 2 / -1; height: 4px; border-radius: 2px; background: #eef1f4; overflow: hidden; margin-top: -4px; }
  .pc-bar i { display: block; height: 100%; background: var(--c); }

  /* Top three, as medals. */
  .pc-top { display: grid; gap: 8px; padding: 12px; }
  .pc-medal {
    display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: center;
    padding: 10px 12px; border-radius: 12px; color: #2a2112;
    background: linear-gradient(135deg, var(--m1), var(--m2));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.5), 0 1px 2px rgba(0,0,0,.08);
  }
  .pc-medal.gold { --m1: #fbe08a; --m2: #e0a82e; }
  .pc-medal.silver { --m1: #f1f3f5; --m2: #b5bec8; color: #1f2933; }
  .pc-medal.bronze { --m1: #f2c29b; --m2: #b8733f; color: #2b1809; }
  .pc-medal-rank {
    width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
    background: rgba(255,255,255,.55); box-shadow: inset 0 0 0 2px rgba(0,0,0,.08);
    font-size: 15px; font-weight: 900;
  }
  .pc-medal-info { min-width: 0; }
  .pc-medal-info strong { display: block; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pc-medal-info span { display: block; font-size: 10px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pc-medal b { font-size: 22px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }

  /* Game log */
  .pc-log-tools { display: flex; align-items: center; gap: 8px; }
  .pc-tabs { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
  .pc-tabs button {
    border: 1px solid var(--pc-line); background: #fff; color: var(--pc-ink);
    border-radius: 999px; padding: 3px 9px; font: inherit; font-size: 10.5px; font-weight: 800; cursor: pointer;
  }
  .pc-tabs button.active { background: var(--pc-ink); border-color: var(--pc-ink); color: #fff; }
  .pc-year {
    display: none; border: 1px solid var(--pc-line); border-radius: 8px; background: #fff; color: var(--pc-ink);
    font: inherit; font-size: 12px; font-weight: 800; padding: 4px 6px;
  }

  .pc-info {
    width: 17px; height: 17px; border-radius: 50%; padding: 0;
    border: 1px solid var(--pc-line); background: var(--pc-soft); color: var(--pc-muted);
    font: italic 900 10px/1 Georgia, serif; display: inline-grid; place-items: center; cursor: pointer;
  }
  .pc-info:hover, .pc-info[aria-expanded="true"] { background: #1769e0; border-color: #1769e0; color: #fff; }
  .pc-help { padding: 10px 14px; border-bottom: 1px solid var(--pc-line); background: #fafbfc; font-size: 11px; }
  .pc-help[hidden] { display: none; }
  .pc-help ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .pc-help li { display: flex; align-items: center; gap: 8px; }
  .pc-help .pc-pts { min-width: 44px; padding: 2px 6px; font-size: 10px; }

  /* The log is rows of a grid, not a <table>: the season pages give every
     table a phone min-width, which would push the points off the card. */
  .pc-log { font-variant-numeric: tabular-nums; }
  .pc-log-row {
    display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; gap: 10px; align-items: center;
    padding: 5px 14px; border-top: 1px solid #eef1f4; font-size: 11.5px;
  }
  .pc-log-row.head {
    padding-top: 6px; padding-bottom: 6px; border-top: 0; background: #f6f8fa; color: #788696;
    font-size: 8.5px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase;
  }
  .pc-log.all .pc-log-row { grid-template-columns: 78px minmax(0, 1fr) auto; }
  .pc-log .wk { white-space: nowrap; color: var(--pc-muted); font-weight: 800; }
  .pc-log .wk sup { color: #b8733f; font-size: 8px; margin-left: 1px; }
  .pc-log .num { text-align: right; }
  .pc-team { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .pc-team .pc-mark { width: 20px; height: 20px; border-radius: 6px; font-size: 8px; }
  .pc-team span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
  .pc-pts {
    display: inline-block; min-width: 58px; padding: 3px 8px; border-radius: 6px;
    text-align: right; font-weight: 900; font-size: 11.5px;
  }
  .pc-pts.start { background: color-mix(in srgb, var(--c) calc(var(--fill) * 100%), #fff); color: var(--pi); }
  .pc-pts.bench { background: #fff; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, #fff); color: var(--pc-muted); font-weight: 700; }

  .pc-chip { display: inline-block; padding: 1px 4px; border-radius: 4px; background: #e7ebef; color: #4b5866; font-size: 8px; font-weight: 900; }
  .pc-empty { padding: 36px; text-align: center; color: var(--pc-muted); }

  [data-player] { cursor: pointer; }
  .bx-name[data-player]:hover, .roster-name[data-player]:hover strong, .starters-name[data-player]:hover strong { text-decoration: underline; text-underline-offset: 2px; }

  /* Phones: a bottom sheet, sized to match the rest of the site's compact
     mobile type rather than the desktop card scaled down. */
  @media (max-width: 760px) {
    .pc {
      left: 0; top: auto; bottom: 0; width: 100%; max-height: 92dvh;
      border-radius: 16px 16px 0 0; transform: translateY(24px); font-size: 11px;
    }
    .pc.open { transform: none; }
    .pc-hero { padding: 14px 50px 14px 12px; gap: 12px; }
    .pc-photo { width: 56px; height: 56px; box-shadow: 0 0 0 3px rgba(255,255,255,.25); }
    .pc-photo .pc-club { width: 24px; height: 24px; right: -4px; }
    .pc-photo .pc-club img { width: 18px; height: 14px; }
    .pc-id h2 { font-size: 18px; }
    .pc-tags { margin-top: 6px; gap: 4px; }
    .pc-tag { font-size: 9px; padding: 2px 7px; }
    .pc-close { top: 10px; right: 10px; width: 30px; height: 30px; font-size: 18px; border-radius: 8px; }
    .pc-body { padding: 8px; gap: 8px; }
    .pc-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .pc-tile { padding: 8px 10px; border-radius: 10px; }
    .pc-tile small { font-size: 7.5px; }
    .pc-tile strong { font-size: 17px; margin-top: 2px; }
    .pc-tile span { font-size: 9px; }
    .pc-card { border-radius: 12px; }
    .pc-card-head { padding: 8px 10px; }
    .pc-card-head h3 { font-size: 12px; }
    .pc-card-head > span { font-size: 9px; }
    .pc-cols { grid-template-columns: 1fr; gap: 8px; }
    .pc-tl-row { grid-template-columns: 30px minmax(0, 1fr) auto; gap: 6px; padding: 6px 10px; }
    .pc-tl-year { font-size: 10.5px; }
    .pc-tl-who { gap: 2px; min-width: 16px; }
    .pc-tl-who .pc-mark { width: 16px; height: 16px; border-radius: 4px; }
    .pc-wk { height: 13px; border-radius: 2px; }
    .pc-tl-strip { gap: 1px; }
    .pc-wk.po { margin-left: 2px; }
    .pc-tl-key { padding: 7px 10px; font-size: 9px; gap: 3px 10px; }
    .pc-mgr { grid-template-columns: 24px minmax(0, 1fr) auto; gap: 8px; padding: 7px 10px; }
    .pc-mark { width: 24px; height: 24px; border-radius: 6px; }
    .pc-mgr-name strong { font-size: 11.5px; }
    .pc-mgr-name span { font-size: 9px; }
    .pc-mgr-nums { gap: 9px; }
    .pc-mgr-nums b { font-size: 12px; }
    .pc-mgr-nums small { font-size: 7.5px; }
    .pc-top { padding: 8px; gap: 6px; }
    .pc-medal { grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; padding: 8px 10px; border-radius: 10px; }
    .pc-medal-rank { width: 28px; height: 28px; font-size: 13px; }
    .pc-medal-info strong { font-size: 10.5px; }
    .pc-medal-info span { font-size: 9px; }
    .pc-medal b { font-size: 18px; }
    .pc-tabs { display: none; }
    .pc-year { display: block; }
    .pc-help { padding: 8px 10px; font-size: 10px; }
    .pc-log-row { grid-template-columns: 34px minmax(0, 1fr) auto; gap: 7px; padding: 4px 10px; font-size: 10.5px; }
    .pc-log.all .pc-log-row { grid-template-columns: 52px minmax(0, 1fr) auto; }
    .pc-log-row.head { font-size: 7.5px; padding-top: 5px; padding-bottom: 5px; }
    .pc-team { gap: 6px; }
    .pc-team .pc-mark { width: 18px; height: 18px; border-radius: 5px; }
    .pc-pts { min-width: 50px; font-size: 10.5px; padding: 2px 7px; }
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
    const total = starts.reduce((t, r) => t + r.pts, 0);
    const best = starts.slice().sort((a, b) => b.pts - a.pts);
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
    return { rows, starts, total, best, wins, losses, managers, seasons, lastClub };
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
    const photo = !isDst && p.h
      ? `<img class="pc-face" src="https://sleepercdn.com/content/nfl/players/thumb/${p.h}.jpg" alt="">`
      : NFL_LOGOS.has(s.lastClub) ? `<img class="pc-club-big" src="nfl-logos/${s.lastClub}.png" alt="">` : "";
    const perStart = s.starts.length ? s.total / s.starts.length : 0;
    const top = s.best[0];
    const bestPts = Math.max(1, ...s.starts.map((r) => r.pts));

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

    const medals = ["gold", "silver", "bronze"];
    const topGames = s.best.slice(0, 3).map((r, i) => {
      const opp = r.game ? teamOf(r.season, r.game[0]) : null;
      const round = r.playoff && r.game && r.game[3] ? ` · ${esc(r.game[3])}` : "";
      return `<div class="pc-medal ${medals[i]}">
        <span class="pc-medal-rank">${i + 1}</span>
        <span class="pc-medal-info">
          <strong>${esc(r.team.name)}${opp ? ` vs ${esc(opp.name)}` : ""}</strong>
          <span>${r.season} · Week ${r.week}${round}${r.result ? ` · ${r.result === "W" ? "Won" : r.result === "L" ? "Lost" : "Tied"}` : ""}</span>
        </span>
        <b>${fmt(r.pts)}</b>
      </div>`;
    }).join("");

    const latest = s.seasons[s.seasons.length - 1];
    card.style.setProperty("--pc-color", lead ? lead.color : "#304f91");
    card.innerHTML = `
      <div class="pc-scroll">
        <header class="pc-hero">
          <div class="pc-photo">${photo}${!isDst ? `<span class="pc-club">${nfl(s.lastClub)}</span>` : ""}</div>
          <div class="pc-id">
            <h2 id="pcName">${esc(p.n)}</h2>
            <div class="pc-tags">
              <span class="pc-tag">${p.p}</span>
              <span class="pc-tag">${s.managers.length} manager${s.managers.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <button type="button" class="pc-close" aria-label="Close player card">&times;</button>
        </header>
        <div class="pc-body">
          <section class="pc-tiles">
            <div class="pc-tile"><small>Starts</small><strong>${s.starts.length}</strong></div>
            <div class="pc-tile"><small>Points per start</small><strong>${fmt(perStart)}</strong></div>
            <div class="pc-tile"><small>Best game</small><strong>${top ? fmt(top.pts) : "—"}</strong><span>${top ? `${top.season} wk ${top.week} · ${esc(top.team.name)}` : "Never started"}</span></div>
            <div class="pc-tile"><small>Record when started</small><strong>${s.wins}–${s.losses}</strong></div>
          </section>

          <section class="pc-card">
            <div class="pc-card-head"><h3>Ownership timeline</h3><span>One cell per week</span></div>
            ${timeline}
            <div class="pc-tl-key">
              <span><i style="background:${lead ? lead.color : "#304f91"}"></i>Started, in that team's colour</span>
              <span><i style="box-shadow: inset 0 0 0 1.5px ${lead ? lead.color : "#304f91"}"></i>Bench</span>
              <span><i style="background:#f1f4f7"></i>Not on a roster</span>
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
            <div class="pc-card-head">
              <h3>Game log <button type="button" class="pc-info" aria-expanded="false" aria-label="What the points shading means">i</button></h3>
              <div class="pc-log-tools">
                <div class="pc-tabs" role="tablist">${s.seasons.map((y) =>
                  `<button type="button" role="tab" data-season="${y}">${y}</button>`).join("")}<button type="button" role="tab" data-season="all">All</button></div>
                <select class="pc-year" aria-label="Season">${s.seasons.slice().reverse().map((y) =>
                  `<option value="${y}">${y}</option>`).join("")}<option value="all">All seasons</option></select>
              </div>
            </div>
            <div class="pc-help" hidden style="--c:${lead ? lead.color : "#304f91"}">
              <ul>
                <li><span class="pc-pts start" style="--fill:.85;--pi:#fff">24.00</span>Started: filled in his team's colour, darker for a bigger score.</li>
                <li><span class="pc-pts start" style="--fill:.3;--pi:#0b1726">6.00</span>A lighter fill is a quieter game.</li>
                <li><span class="pc-pts bench">12.00</span>Outlined: on the bench or IR, so the points did not count.</li>
                <li><span class="pc-pts" style="min-width:0;padding:0;color:#b8733f;font-size:10px">15<sup>P</sup></span>A P marks a playoff week.</li>
              </ul>
            </div>
            <div class="pc-log-wrap"></div>
          </section>
        </div>
      </div>`;

    // A photo Sleeper no longer serves falls back to his club's logo.
    const face = card.querySelector(".pc-face");
    if (face) face.addEventListener("error", () => {
      face.outerHTML = NFL_LOGOS.has(s.lastClub) ? `<img class="pc-club-big" src="nfl-logos/${s.lastClub}.png" alt="">` : "";
    });

    // The shading is on the player's own scale: his best start is the darkest.
    const inkOn = (hex, fill) => {
      const n = parseInt(hex.slice(1), 16);
      const mix = (c) => fill * c + (1 - fill) * 255;
      const lum = (0.299 * mix((n >> 16) & 255) + 0.587 * mix((n >> 8) & 255) + 0.114 * mix(n & 255)) / 255;
      return lum < 0.6 ? "#fff" : "#0b1726";
    };
    const logWrap = card.querySelector(".pc-log-wrap");
    const select = card.querySelector(".pc-year");
    const showLog = (season) => {
      const all = season === "all";
      const list = s.rows.filter((r) => all || r.season === Number(season)).slice().reverse();
      logWrap.innerHTML = `<div class="pc-log${all ? " all" : ""}"><div class="pc-log-row head"><span>Wk</span><span>Team</span><span class="num">Pts</span></div>
        ${list.map((r) => {
          const fill = r.started ? .22 + .78 * Math.max(0, r.pts) / bestPts : 0;
          const tip = `${r.season} week ${r.week}${r.playoff && r.game && r.game[3] ? ` (${r.game[3]})` : ""} · ${r.started ? r.slot : r.slot === "IR" ? "IR" : "bench"} · projected ${fmt(r.proj)}${r.result && r.started ? ` · ${r.result === "W" ? "won" : r.result === "L" ? "lost" : "tied"}` : ""}`;
          return `<div class="pc-log-row" title="${esc(tip)}">
            <span class="wk">${all ? `’${String(r.season).slice(2)} · ` : ""}${r.week}${r.playoff ? "<sup>P</sup>" : ""}</span>
            <span class="pc-team">${mark(r.team)}<span>${esc(r.team.name)}</span></span>
            <span class="num"><span class="pc-pts ${r.started ? "start" : "bench"}" style="--c:${r.team.color};--fill:${fill.toFixed(2)};--pi:${inkOn(r.team.color, fill)}">${fmt(r.pts)}</span></span>
          </div>`;
        }).join("")}</div>`;
      card.querySelectorAll(".pc-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.season === String(season)));
      select.value = String(season);
    };
    showLog(latest);
    card.querySelector(".pc-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-season]");
      if (b) showLog(b.dataset.season);
    });
    select.addEventListener("change", () => showLog(select.value));
    const info = card.querySelector(".pc-info");
    const help = card.querySelector(".pc-help");
    info.addEventListener("click", () => {
      help.hidden = !help.hidden;
      info.setAttribute("aria-expanded", String(!help.hidden));
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
