/* Ask the League: an AI that answers questions about SLUH 22.

   A button in the corner of the season pages, the record book and the keeper
   page opens a chat with the League Historian, who answers from the league's
   own files: champions, rivalries, records, streaks, drafts, keepers, a
   player's history with the league, this season so far. It talks some smack
   when the numbers hand it to it.

   It is the same chat as Pigskin Pantheon's (github.com/cev64/leaguehistoryapp,
   chat.js), reading this site's files instead of Sleeper's:
     - the league as text (`digestOf`): every season's standings, champion,
       last place, every game's score and every playoff game, from
       league-data.js and the live season's page, plus all-time tables worked
       out here (records, head-to-head, streaks, titles), so the AI never has
       to add up hundreds of games itself
     - tools for anything finer (`toolkit`): box scores, a player's history,
       a manager's season, the best weeks, drafts, keepers, roster moves,
       lineup efficiency and the weekly recaps. The AI asks for one, this file
       works it out from boxscores/, drafts/ and the season pages, and sends
       it back.
   Both go to the sluh22-chat function (supabase/functions/sluh22-chat), which
   holds the Gemini API key and streams the answer back. Nothing about the
   league is stored anywhere but this browser: the conversation is kept in
   sessionStorage so it follows the visitor from page to page, and is gone
   when the tab is.

   Where it asks: CHAT_URL below. For trying the function on your own
   computer, open any page with ?chat=http://localhost:8000 once; only a
   localhost address is taken that way, so a link can't send the chat (or the
   passcode) anywhere else.

   Plain script, not a module, like league-data.js. It needs nothing else on
   the page: league-data.js and keepers.js are loaded when it first needs
   them. */
(function () {
  "use strict";

  const CHAT_URL = "https://vnmzjfnfqqxedbmirakb.supabase.co/functions/v1/sluh22-chat";
  const ENDPOINT = (() => {
    try {
      const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/;
      const q = new URLSearchParams(location.search).get("chat");
      if (q && local.test(q)) sessionStorage.setItem("sluh22-chat:url", q);
      const saved = sessionStorage.getItem("sluh22-chat:url");
      return saved && local.test(saved) ? saved : CHAT_URL;
    } catch (err) { return CHAT_URL; }
  })();
  const STORE_KEY = "sluh22-chat";
  const PASS_KEY = "sluh22-chat:passcode";
  const LEAGUE = "SLUH 22";
  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)");
  const PHONE = matchMedia("(max-width: 640px)");
  // A conversation this long is closed for a fresh one: the AI reads all of
  // it on every question. One question can add up to 18 turns (eight
  // look-ups), which still fits under the function's 80.
  const MAX_TURNS = 60;
  const MAX_TOOL_ROUNDS = 8;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const f2 = (n) => Number(n || 0).toFixed(2);
  const f1 = (n) => Number(n || 0).toFixed(1);
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  // Player names as the drafts and box scores both spell them: ESPN's draft
  // says "Aaron Jones Sr.", the lineups "Aaron Jones".
  const pnorm = (s) => norm(s).replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/\s+/g, " ").trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  /* ================================================================
     The league's files
     ================================================================ */

  const fetched = new Map();
  function getJSON(url) {
    if (!fetched.has(url)) {
      fetched.set(url, fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: ${r.status}`))))
        .catch((err) => { fetched.delete(url); throw err; }));
    }
    return fetched.get(url);
  }
  function getText(url) {
    const key = `text:${url}`;
    if (!fetched.has(key)) {
      fetched.set(key, fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${url}: ${r.status}`))))
        .catch((err) => { fetched.delete(key); throw err; }));
    }
    return fetched.get(key);
  }
  const scripts = new Map();
  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const tag = document.createElement("script");
        tag.src = src;
        tag.onload = () => (ready() ? resolve() : reject(new Error(`${src} loaded empty`)));
        tag.onerror = () => { scripts.delete(src); reject(new Error(`couldn't load ${src}`)); };
        document.head.appendChild(tag);
      }));
    }
    return scripts.get(src);
  }

  /* A literal from a season page's script (`const teams = {...}`), read the
     way alltime.html and keepers.html read them. */
  function pageBlock(html, name) {
    const start = html.indexOf(`const ${name} = {`);
    if (start < 0) return null;
    let depth = 0, i = html.indexOf("{", start);
    const open = i;
    for (; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}" && --depth === 0) break;
    }
    try { return new Function(`return ${html.slice(open, i + 1)};`)(); } catch (err) { return null; }
  }
  const pages = new Map();
  function seasonPage(year) {
    if (!pages.has(year)) {
      pages.set(year, getText(`${year}.html`).then((html) => {
        const weeks = html.match(/const REGULAR_WEEKS = (\d+)/);
        return {
          teams: pageBlock(html, "teams"),
          schedule: pageBlock(html, "schedule"),
          results: pageBlock(html, "results"),
          playoffResults: pageBlock(html, "playoffResults"),
          weeklySummaries: pageBlock(html, "weeklySummaries"),
          divisionBet: pageBlock(html, "divisionBet"),
          regularWeeks: weeks ? Number(weeks[1]) : 14,
        };
      }).catch((err) => { pages.delete(year); throw err; }));
    }
    return pages.get(year);
  }

  // The recap text on the season pages carries a little HTML.
  const plain = (html) => {
    const el = document.createElement("textarea");
    el.innerHTML = String(html || "").replace(/<[^>]*>/g, "");
    return el.value.replace(/\s+/g, " ").trim();
  };

  // ESPN's team id -> this site's team id today: the same table as keepers.js
  // and tools/boxscores/raw.mjs. ESPN ids are the franchise, so a draft's
  // `team` reaches its manager whatever the team was called.
  const ESPN_TEAM = {
    1: "game", 2: "kareem", 3: "hawaii", 4: "infinity", 5: "left",
    6: "hamilton", 7: "jared", 8: "laporta", 9: "roll", 11: "first",
  };
  // Only the title survives from 2020, the season before the records begin;
  // the record book counts it among the championships, and so does this.
  const EARLIER_TITLES = { charlie_vonderheid: [2020] };
  const TITLE_PATH = new Set(["Quarterfinal", "Semifinal", "Championship"]);

  // Two managers who left after 2021, Jack Figge ("Team Inactive") and
  // Stephen Deves ("Kroenke Sucks"), are never brought up: nothing that names
  // them reaches the AI, from the summary, a tool or a written recap. Their
  // games still count in everyone else's records, playoff wins and streaks;
  // only the lines about them are left out. As a last check, any line still
  // naming them is dropped from whatever is sent (`unsaid`).
  const UNSPOKEN = new Set(["jack_figge", "stephen_deves"]);
  const UNSPOKEN_WORDS = /\b(figge|deves|kroenke|team inactive)\b/i;
  const unspoken = (text) => UNSPOKEN_WORDS.test(String(text == null ? "" : text));
  const unsaid = (text) => String(text).split("\n").filter((line) => !unspoken(line)).join("\n");
  const BENCH = new Set(["BE", "IR"]);

  /* ================================================================
     The league, as one model: every season in one shape
     ================================================================ */

  let modelJob = null;
  function league() {
    return (modelJob = modelJob || buildModel().catch((err) => { modelJob = null; throw err; }));
  }

  async function buildModel() {
    await loadScript("league-data.js", () => Boolean(window.LEAGUE_DATA));
    const LD = window.LEAGUE_DATA;
    const owners = {};
    Object.entries(LD.owners).forEach(([id, o]) => { owners[id] = { name: o.name, currentTeam: o.currentTeam }; });

    const seasons = LD.seasons.map((s) => {
      const post = s.postseasonGames.map((g) => ({ ...g }));
      (LD.thirdPlaceGames || []).filter((t) => t.year === s.year).forEach((t) => post.push({
        week: t.week, a: t.winner, aScore: t.winScore, b: t.loser, bScore: t.loseScore, label: "3rd Place Game",
      }));
      const ids = Object.keys(s.teams);
      const byRank = (r) => ids.find((id) => s.teams[id].finalRank === r) || null;
      const weeks = s.regularGames.map((g) => g.week);
      return {
        year: s.year, finished: true, teams: s.teams, regular: s.regularGames, post,
        regularWeeks: Math.max(...weeks), throughWeek: Math.max(...weeks),
        champion: byRank(1), runnerUp: byRank(2), third: byRank(3),
        lastPlace: ids.find((id) => s.teams[id].officialLastPlace) || byRank(ids.length),
      };
    });

    // The season being played lives on its own page; its scores are posted
    // there each week. It's the year after the newest one league-data.js has.
    const next = Math.max(...seasons.map((s) => s.year)) + 1;
    try {
      const page = await seasonPage(next);
      if (page.teams && page.results) {
        const teams = {};
        Object.entries(page.teams).forEach(([id, t]) => {
          teams[id] = { ...t, name: String(t.name).trim(), wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, divWins: 0, divLosses: 0 };
        });
        const regular = [];
        Object.entries(page.results).forEach(([week, games]) => games.forEach(([a, aScore, b, bScore]) => {
          if (!teams[a] || !teams[b]) return;
          regular.push({ week: Number(week), a, aScore, b, bScore });
          const A = teams[a], B = teams[b], div = A.division === B.division;
          A.pf += aScore; A.pa += bScore; B.pf += bScore; B.pa += aScore;
          if (aScore > bScore) { A.wins++; B.losses++; if (div) { A.divWins++; B.divLosses++; } }
          else if (bScore > aScore) { B.wins++; A.losses++; if (div) { B.divWins++; A.divLosses++; } }
          else { A.ties++; B.ties++; }
        }));
        const post = [];
        Object.entries(page.playoffResults || {}).forEach(([week, games]) => games.forEach(([a, aScore, b, bScore]) => {
          if (teams[a] && teams[b]) post.push({ week: Number(week), a, aScore, b, bScore, label: "Playoffs or Toilet Bowl" });
        }));
        const through = regular.length ? Math.max(...regular.map((g) => g.week)) : 0;
        seasons.push({
          year: next, finished: false, live: true, teams, regular, post,
          regularWeeks: page.regularWeeks, throughWeek: through,
          schedule: page.schedule || {}, recaps: page.weeklySummaries || {}, divisionBet: page.divisionBet,
          champion: null, runnerUp: null, third: null, lastPlace: null,
        });
      }
    } catch (err) { /* no live season page: the finished seasons stand alone */ }

    // Anyone who has managed a team, the two who left after 2021 included.
    seasons.forEach((s) => Object.values(s.teams).forEach((t) => {
      if (!owners[t.ownerId]) owners[t.ownerId] = { name: t.owner || t.ownerId, currentTeam: null, departed: true };
    }));
    return { owners, seasons, season: (y) => seasons.find((s) => s.year === y) || null };
  }

  // Every game, oldest first, with both managers. Playoff games carry their
  // label; `titlePath` marks the ones on the road to the title.
  function gamesOf(model) {
    const out = [];
    model.seasons.forEach((s) => {
      const add = (g, label) => {
        const A = s.teams[g.a], B = s.teams[g.b];
        if (!A || !B) return;
        out.push({
          year: s.year, week: g.week, a: g.a, b: g.b, aScore: g.aScore, bScore: g.bScore,
          aOwner: A.ownerId, bOwner: B.ownerId, label: label || null, post: Boolean(label),
          titlePath: TITLE_PATH.has(label), losers: /^Losers/i.test(label || ""),
        });
      };
      s.regular.forEach((g) => add(g, null));
      s.post.forEach((g) => add(g, g.label));
    });
    return out.sort((x, y) => x.year - y.year || x.week - y.week);
  }

  const record = (t) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
  // A finished season in its final order; the live one by record, then points.
  function standing(s) {
    const ids = Object.keys(s.teams);
    return s.finished
      ? ids.sort((a, b) => s.teams[a].finalRank - s.teams[b].finalRank)
      : ids.sort((a, b) => s.teams[b].wins - s.teams[a].wins || s.teams[a].losses - s.teams[b].losses || s.teams[b].pf - s.teams[a].pf);
  }

  /* ================================================================
     The league as text
     ================================================================ */

  async function digestOf(model) {
    const owners = model.owners;
    const name = (oid) => (owners[oid] ? owners[oid].name : "Unknown");
    const seasons = model.seasons;
    const live = seasons.find((s) => s.live);
    const games = gamesOf(model);
    const L = [];
    const today = new Date().toISOString().slice(0, 10);

    L.push(`Today is ${today}. League: ${LEAGUE}.`);
    L.push(`Seasons on record: ${seasons.map((s) => s.year).join(", ")}.${live ? ` The ${live.year} season is in progress (regular season through week ${live.throughWeek} of ${live.regularWeeks}).` : ""} 2020 was played too, but only its champion is kept: Charlie Vonderheid.`);
    L.push("Format: ESPN (2022 was played on Sleeper). 10 teams. Two divisions, Xavier and Ignatius. A 14-week regular season, then playoffs in weeks 15-17: six teams since 2022, two of them on a week-15 bye (the division champions, under the current rules; eight teams in 2021). The teams left out play the Toilet Bowl (the losers bracket), where winning keeps you out of last place; its loser finishes last. Lineup: QB, 2 RB, 2 WR, TE, FLEX, K, D/ST through 2023; QB, 2 RB, 2 WR, TE, 2 FLEX, D/ST (no kicker) from 2024. Keepers from 2025: up to 3 a team, kept in the first rounds of the next draft. Week 14 is the fixed rivalry week.");

    /* managers */
    L.push("", "## Managers (the people; team names change by season)");
    Object.entries(owners).filter(([oid]) => !UNSPOKEN.has(oid)).forEach(([oid, o]) => {
      const mine = seasons.filter((s) => Object.values(s.teams).some((t) => t.ownerId === oid));
      const teams = mine.map((s) => `${s.year} "${String(Object.values(s.teams).find((t) => t.ownerId === oid).name).trim()}"`);
      L.push(`- ${o.name}: ${plural(mine.length, "season")} (${teams.join(", ")})${o.departed ? ", no longer in the league" : ""}`);
    });

    /* all-time tables */
    const career = {};
    const c = (oid) => (career[oid] = career[oid] || {
      seasons: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, gp: 0, titles: [], seconds: [], lasts: [], apps: new Set(),
      pw: 0, pl: 0, finishes: [], high: null, low: null,
    });
    seasons.forEach((s) => {
      Object.values(s.teams).forEach((t) => {
        const r = c(t.ownerId);
        r.seasons++;
        r.w += t.wins; r.l += t.losses; r.t += t.ties || 0; r.pf += t.pf; r.pa += t.pa;
        if (s.finished && t.finalRank) r.finishes.push(t.finalRank);
      });
      if (s.champion) c(s.teams[s.champion].ownerId).titles.push(s.year);
      if (s.runnerUp) c(s.teams[s.runnerUp].ownerId).seconds.push(s.year);
      if (s.lastPlace) c(s.teams[s.lastPlace].ownerId).lasts.push(s.year);
    });
    Object.entries(EARLIER_TITLES).forEach(([oid, years]) => { if (career[oid]) career[oid].titles.unshift(...years); });
    games.forEach((g) => {
      [[g.aOwner, g.aScore, g.bScore], [g.bOwner, g.bScore, g.aScore]].forEach(([oid, mine, theirs]) => {
        const r = c(oid);
        if (!g.post) r.gp++;
        if (g.titlePath) {
          r.apps.add(g.year);
          if (mine > theirs) r.pw++; else if (mine < theirs) r.pl++;
        }
        if (!r.high || mine > r.high.pts) r.high = { pts: mine, year: g.year, week: g.week };
        if (mine > 0 && (!r.low || mine < r.low.pts)) r.low = { pts: mine, year: g.year, week: g.week };
      });
    });
    L.push("", `## All-time, by manager (${seasons.map((s) => s.year).join(", ")}${live ? `; ${live.year} so far` : ""})`,
      "Regular-season records and points are the official standings. Titles include 2020. Playoff record (and every playoff win or loss) counts only the main bracket on the road to the title: quarterfinals, semifinals and the championship. Placement games (3rd place, 5th place) and Toilet Bowl games are never playoff wins.",
      "manager | seasons | regular season W-L (win%) | PF | PA | PF/game | titles | runner-up | last place | playoff trips | playoff W-L | finishes | highest / lowest game");
    const winPctOf = (r) => (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t);
    Object.entries(career).filter(([oid]) => !UNSPOKEN.has(oid)).sort((a, b) => b[1].titles.length - a[1].titles.length || winPctOf(b[1]) - winPctOf(a[1]))
      .forEach(([oid, r]) => {
        const dec = r.w + r.l + r.t;
        L.push([
          name(oid), r.seasons, `${r.w}-${r.l}${r.t ? `-${r.t}` : ""} (${dec ? pct(winPctOf(r)) : "–"})`,
          f2(r.pf), f2(r.pa), r.gp ? f2(r.pf / r.gp) : "–",
          r.titles.length ? `${r.titles.length} (${r.titles.join(", ")})` : "0",
          r.seconds.length ? `${r.seconds.length} (${r.seconds.join(", ")})` : "0",
          r.lasts.length ? `${r.lasts.length} (${r.lasts.join(", ")})` : "0",
          r.apps.size, `${r.pw}-${r.pl}`,
          r.finishes.length ? `${r.finishes.join(", ")} (avg ${f1(r.finishes.reduce((x, y) => x + y, 0) / r.finishes.length)})` : "–",
          r.high ? `${f2(r.high.pts)} (${r.high.year} wk ${r.high.week}) / ${f2(r.low.pts)} (${r.low.year} wk ${r.low.week})` : "–",
        ].join(" | "));
      });

    /* head-to-head */
    const h2h = {};
    games.forEach((g) => {
      const [x, y] = [g.aOwner, g.bOwner].sort();
      const r = (h2h[`${x}|${y}`] = h2h[`${x}|${y}`] || { x, y, xw: 0, yw: 0, t: 0, xpf: 0, ypf: 0, pxw: 0, pyw: 0, last: null });
      const xs = g.aOwner === x ? g.aScore : g.bScore, ys = g.aOwner === x ? g.bScore : g.aScore;
      r.xpf += xs; r.ypf += ys;
      if (xs > ys) { r.xw++; if (g.titlePath) r.pxw++; } else if (ys > xs) { r.yw++; if (g.titlePath) r.pyw++; } else r.t++;
      r.last = `${g.year} wk ${g.week}: ${name(g.aOwner)} ${f2(g.aScore)}–${f2(g.bScore)} ${name(g.bOwner)}`;
    });
    L.push("", "## Head-to-head, every meeting (regular season and every postseason game)");
    Object.values(h2h).filter((r) => !UNSPOKEN.has(r.x) && !UNSPOKEN.has(r.y)).sort((p, q) => (q.xw + q.yw + q.t) - (p.xw + p.yw + p.t)).forEach((r) => {
      const playoff = r.pxw + r.pyw ? ` (playoff games ${r.pxw}-${r.pyw})` : "";
      L.push(`- ${name(r.x)} ${r.xw}-${r.yw}${r.t ? `-${r.t}` : ""} ${name(r.y)}${playoff}; points ${f2(r.xpf)}–${f2(r.ypf)}; last: ${r.last}`);
    });

    /* records */
    const sides = [];
    games.forEach((g) => {
      sides.push({ oid: g.aOwner, pts: g.aScore, opp: g.bOwner, oppPts: g.bScore, g });
      sides.push({ oid: g.bOwner, pts: g.bScore, opp: g.aOwner, oppPts: g.aScore, g });
    });
    // the records name both sides, so only games between managers who are named
    const said = (g) => !UNSPOKEN.has(g.aOwner) && !UNSPOKEN.has(g.bOwner);
    const games2 = games.filter(said);
    const sides2 = sides.filter((x) => said(x.g));
    const when = (g) => `${g.year} wk ${g.week}${g.label ? `, ${g.label}` : ""}`;
    const sideLine = (x) => `${name(x.oid)} ${f2(x.pts)} vs ${name(x.opp)} ${f2(x.oppPts)} (${when(x.g)})`;
    const gameLine = (g) => `${name(g.aOwner)} ${f2(g.aScore)}–${f2(g.bScore)} ${name(g.bOwner)} (${when(g)}, margin ${f2(Math.abs(g.aScore - g.bScore))})`;
    L.push("", "## League records (every game, playoffs included)");
    L.push("Highest scores:", ...sides2.slice().sort((p, q) => q.pts - p.pts).slice(0, 12).map((x, i) => `${i + 1}. ${sideLine(x)}`));
    L.push("Lowest scores:", ...sides2.filter((x) => x.pts > 0).sort((p, q) => p.pts - q.pts).slice(0, 10).map((x, i) => `${i + 1}. ${sideLine(x)}`));
    L.push("Biggest blowouts:", ...games2.slice().sort((p, q) => Math.abs(q.aScore - q.bScore) - Math.abs(p.aScore - p.bScore)).slice(0, 10).map((g, i) => `${i + 1}. ${gameLine(g)}`));
    L.push("Closest games:", ...games2.slice().sort((p, q) => Math.abs(p.aScore - p.bScore) - Math.abs(q.aScore - q.bScore)).slice(0, 10).map((g, i) => `${i + 1}. ${gameLine(g)}`));
    L.push("Highest combined:", ...games2.slice().sort((p, q) => (q.aScore + q.bScore) - (p.aScore + p.bScore)).slice(0, 5).map((g, i) => `${i + 1}. ${gameLine(g)} = ${f2(g.aScore + g.bScore)}`));
    L.push("Highest scores in a loss:", ...sides2.filter((x) => x.pts < x.oppPts).sort((p, q) => q.pts - p.pts).slice(0, 5).map((x, i) => `${i + 1}. ${sideLine(x)}`));
    L.push("Lowest scores in a win:", ...sides2.filter((x) => x.pts > x.oppPts).sort((p, q) => p.pts - q.pts).slice(0, 5).map((x, i) => `${i + 1}. ${sideLine(x)}`));

    const teamSeasons = [];
    seasons.forEach((s) => Object.values(s.teams).forEach((t) => {
      const gp = t.wins + t.losses + (t.ties || 0);
      if (gp && !UNSPOKEN.has(t.ownerId)) teamSeasons.push({ s, t, gp });
    }));
    const tsLine = (x) => `${name(x.t.ownerId)} ("${String(x.t.name).trim()}", ${x.s.year}${x.s.finished ? "" : " so far"}): ${record(x.t)}, PF ${f2(x.t.pf)}, PA ${f2(x.t.pa)}${x.s.finished && x.t.finalRank ? `, finished ${x.t.finalRank}` : ""}`;
    const tsPct = (x) => (x.t.wins + (x.t.ties || 0) / 2) / Math.max(1, x.gp);
    L.push("Best regular seasons by record:", ...teamSeasons.slice().sort((p, q) => tsPct(q) - tsPct(p) || q.t.pf - p.t.pf).slice(0, 6).map((x, i) => `${i + 1}. ${tsLine(x)}`));
    L.push("Worst regular seasons by record:", ...teamSeasons.slice().sort((p, q) => tsPct(p) - tsPct(q) || p.t.pf - q.t.pf).slice(0, 5).map((x, i) => `${i + 1}. ${tsLine(x)}`));
    L.push("Most points per game in a season:", ...teamSeasons.slice().sort((p, q) => q.t.pf / q.gp - p.t.pf / p.gp).slice(0, 6).map((x, i) => `${i + 1}. ${tsLine(x)} (${f2(x.t.pf / x.gp)}/game)`));
    L.push("Fewest points per game in a season:", ...teamSeasons.slice().sort((p, q) => p.t.pf / p.gp - q.t.pf / q.gp).slice(0, 5).map((x, i) => `${i + 1}. ${tsLine(x)} (${f2(x.t.pf / x.gp)}/game)`));
    L.push("Most points against per game in a season (unluckiest schedules):", ...teamSeasons.slice().sort((p, q) => q.t.pa / q.gp - p.t.pa / p.gp).slice(0, 5).map((x, i) => `${i + 1}. ${tsLine(x)} (${f2(x.t.pa / x.gp)} against/game)`));

    // Streaks run across seasons, game by game, regular season and playoff
    // games on the road to the title; a tie ends both kinds.
    const streak = {};
    games.filter((g) => !g.post || g.titlePath).forEach((g) => {
      [[g.aOwner, g.aScore - g.bScore], [g.bOwner, g.bScore - g.aScore]].forEach(([oid, d]) => {
        const r = (streak[oid] = streak[oid] || { cur: 0, bestW: null, bestL: null, start: null });
        const kind = d > 0 ? 1 : d < 0 ? -1 : 0;
        if (!kind || Math.sign(r.cur) !== kind) { r.cur = kind; r.start = g; } else r.cur += kind;
        const span = `${r.start.year} wk ${r.start.week} to ${g.year} wk ${g.week}`;
        if (r.cur > 0 && (!r.bestW || r.cur > r.bestW.n)) r.bestW = { n: r.cur, span };
        if (r.cur < 0 && (!r.bestL || -r.cur > r.bestL.n)) r.bestL = { n: -r.cur, span };
      });
    });
    L.push("Longest streaks (regular season and winners bracket, across seasons):");
    Object.entries(streak).filter(([oid]) => !UNSPOKEN.has(oid)).sort((p, q) => ((q[1].bestW || {}).n || 0) - ((p[1].bestW || {}).n || 0)).forEach(([oid, r]) => {
      L.push(`- ${name(oid)}: longest winning ${r.bestW ? `${r.bestW.n} (${r.bestW.span})` : "0"}; longest losing ${r.bestL ? `${r.bestL.n} (${r.bestL.span})` : "0"}; current ${r.cur > 0 ? `W${r.cur}` : r.cur < 0 ? `L${-r.cur}` : "none"}`);
    });

    /* each season */
    seasons.forEach((s) => {
      const tm = (id) => (s.teams[id] ? name(s.teams[id].ownerId) : "?");
      const hid = (id) => Boolean(s.teams[id] && UNSPOKEN.has(s.teams[id].ownerId));
      const said = (g) => !hid(g.a) && !hid(g.b);
      const tn = (id) => (s.teams[id] ? `"${String(s.teams[id].name).trim()}"` : "");
      L.push("", `## ${s.year} season${s.finished ? "" : ` (in progress: through week ${s.throughWeek} of ${s.regularWeeks})`}`);
      if (s.champion) {
        const final = s.post.find((g) => g.label === "Championship");
        if (final) {
          const loser = final.a === s.champion ? final.b : final.a;
          const ws = final.a === s.champion ? final.aScore : final.bScore, ls = final.a === s.champion ? final.bScore : final.aScore;
          L.push(`Champion: ${tm(s.champion)} (${tn(s.champion)}), ${hid(loser) ? "won" : `beat ${tm(loser)}`} ${f2(ws)}–${f2(ls)} in the final (week ${final.week}).`);
        } else L.push(`Champion: ${tm(s.champion)} (${tn(s.champion)}).`);
      }
      if (s.runnerUp && !hid(s.runnerUp)) L.push(`Runner-up: ${tm(s.runnerUp)}.${s.third && !hid(s.third) ? ` Third: ${tm(s.third)}.` : ""}`);
      if (s.lastPlace && !hid(s.lastPlace)) L.push(`Last place: ${tm(s.lastPlace)} (${tn(s.lastPlace)}).`);
      L.push(s.finished
        ? "Final standings (final place, after the playoffs and Toilet Bowl): team (manager) W-L, PF, PA [division]"
        : "Standings so far (by record, then points for; the season page applies the full tiebreakers): team (manager) W-L, PF, PA [division]");
      standing(s).filter((id) => !hid(id)).forEach((id, i) => {
        const t = s.teams[id];
        const div = t.division ? ` [${t.division}${t.divRecord ? `, ${t.divRecord} in division` : t.divWins + t.divLosses ? `, ${t.divWins}-${t.divLosses} in division` : ""}]` : "";
        L.push(`${s.finished ? t.finalRank : i + 1}. ${tn(id)} (${tm(id)}) ${record(t)}, PF ${f2(t.pf)}, PA ${f2(t.pa)}${div}`);
      });
      L.push("Regular-season games (manager score–score manager):");
      const byWeek = {};
      s.regular.filter(said).forEach((g) => (byWeek[g.week] = byWeek[g.week] || []).push(g));
      Object.keys(byWeek).map(Number).sort((a, b) => a - b).forEach((w) => {
        L.push(`Wk ${w}: ${byWeek[w].map((g) => `${tm(g.a)} ${f2(g.aScore)}–${f2(g.bScore)} ${tm(g.b)}`).join("; ")}`);
      });
      if (s.post.some(said)) {
        L.push("Postseason:");
        s.post.filter(said).sort((x, y) => x.week - y.week || (TITLE_PATH.has(y.label) - TITLE_PATH.has(x.label))).forEach((g) => {
          const winner = g.aScore >= g.bScore ? g.a : g.b;
          const losers = /^Losers/i.test(g.label);
          L.push(`Wk ${g.week} ${g.label}: ${tm(g.a)} ${f2(g.aScore)}–${f2(g.bScore)} ${tm(g.b)} → ${tm(winner)} ${losers ? "wins (Toilet Bowl: the winner is spared)" : "wins"}${!TITLE_PATH.has(g.label) && !losers && g.label !== "Playoffs or Toilet Bowl" ? " (placement game: not a playoff win)" : ""}`);
        });
      }
      if (s.live) {
        const next = Object.keys(s.schedule).map(Number).filter((w) => w > s.throughWeek).sort((a, b) => a - b)[0];
        if (next) L.push(`Next up, week ${next}${next === 14 ? " (rivalry week)" : ""}: ${s.schedule[next].map(([a, b]) => `${tm(a)} vs ${tm(b)}`).join("; ")}`);
        const left = Object.keys(s.schedule).map(Number).filter((w) => w > s.throughWeek).sort((a, b) => a - b);
        if (left.length > 1) {
          L.push("Rest of the schedule:");
          left.slice(1).forEach((w) => L.push(`Wk ${w}: ${s.schedule[w].map(([a, b]) => `${tm(a)} vs ${tm(b)}`).join("; ")}`));
        }
        if (s.divisionBet && s.divisionBet.sides) {
          const tally = {};
          s.regular.forEach((g) => {
            const A = s.teams[g.a], B = s.teams[g.b];
            if (A.division === B.division || g.aScore === g.bScore) return;
            const won = g.aScore > g.bScore ? A.division : B.division;
            tally[won] = (tally[won] || 0) + 1;
          });
          L.push(`Side bet, "${s.divisionBet.title || "Division War"}": every game between the two divisions counts once. ${Object.entries(s.divisionBet.sides).map(([div, side]) => `${div} (${side.bettor}'s side) ${tally[div] || 0}`).join(", ")} so far.`);
        }
        const recaps = Object.entries(s.recaps || {}).filter(([w]) => Number(w) > 0).sort((a, b) => a[0] - b[0]);
        if (recaps.length) {
          L.push("This season's weekly recap headlines:");
          recaps.forEach(([w, r]) => { if (!unspoken(r.headline)) L.push(`Wk ${w}: ${plain(r.headline)}`); });
        }
      }
    });

    /* who each manager has leaned on */
    try {
      const st = await Promise.race([getJSON("boxscores/starters.json"), sleep(15000).then(() => null)]);
      if (st) {
        L.push("", "## Each manager's most-started players, all seasons");
        Object.entries(st.owners).filter(([oid]) => !UNSPOKEN.has(oid)).forEach(([oid, o]) => {
          L.push(`- ${name(oid)}: ${o.players.slice(0, 8).map((p) => `${p.name} (${p.pos}, ${p.starts} starts)`).join(", ")}`);
        });
      }
    } catch (err) { /* the tools still have it */ }

    return unsaid(L.join("\n"));
  }

  /* ================================================================
     Lineups: the best a manager could have set, week by week
     ================================================================ */

  const posOf = (p) => (p.pos === "D/ST" || p.pos === "DEF" ? "DST" : p.pos);
  const FLEX = new Set(["RB", "WR", "TE"]);
  const fits = (slot, pos) => (slot === "FLEX" ? FLEX.has(pos) : slot === "D/ST" ? pos === "DST" : slot === pos);

  // One week: for each team, what it scored from its starters, the best it
  // could have scored from everyone on its roster but IR, and its costliest
  // benching. The week's slots are the fullest lineup anyone set, so a
  // manager who left a slot empty is held to the full lineup.
  function lineupWeek(box) {
    const slotsOf = (lu) => lu.filter((p) => p.starter).map((p) => p.slot);
    let slots = [];
    box.games.forEach((g) => Object.values(g.lineups).forEach((lu) => { const s = slotsOf(lu); if (s.length > slots.length) slots = s; }));
    const order = slots.filter((s) => s !== "FLEX").concat(slots.filter((s) => s === "FLEX"));
    const rows = [];
    box.games.forEach((g) => {
      [[g.home, g.homeScore, g.away, g.awayScore], [g.away, g.awayScore, g.home, g.homeScore]].forEach(([tid, score, opp, oppScore]) => {
        const lu = g.lineups[tid] || [];
        const starters = lu.filter((p) => p.starter);
        const actual = starters.reduce((x, p) => x + (p.pts || 0), 0);
        const pool = lu.filter((p) => p.slot !== "IR").slice();
        let best = 0;
        order.forEach((slot) => {
          let pick = -1;
          pool.forEach((p, i) => { if (fits(slot, posOf(p)) && (pick < 0 || p.pts > pool[pick].pts)) pick = i; });
          if (pick >= 0) { best += Math.max(0, pool[pick].pts || 0); pool.splice(pick, 1); }
        });
        best = Math.max(best, actual);
        let blunder = null;
        lu.filter((p) => p.slot === "BE").forEach((b) => starters.forEach((s) => {
          if (!fits(s.slot, posOf(b))) return;
          const cost = (b.pts || 0) - (s.pts || 0);
          if (cost > 0 && (!blunder || cost > blunder.cost)) blunder = { cost, benched: b, started: s };
        }));
        rows.push({ teamId: tid, week: box.week, score, oppScore, opp, actual, best, blunder });
      });
    });
    return rows;
  }

  const seasonLineups = new Map();
  function lineupSeason(year) {
    if (!seasonLineups.has(year)) {
      seasonLineups.set(year, getJSON(`boxscores/${year}/index.json`).then((weeks) =>
        Promise.all(weeks.map((w) => getJSON(`boxscores/${year}/week-${w}.json`)))).then((boxes) => {
        const byTeam = {};
        const blunders = [];
        boxes.forEach((box) => lineupWeek(box).forEach((r) => {
          const t = (byTeam[r.teamId] = byTeam[r.teamId] || { teamId: r.teamId, actual: 0, best: 0, perfect: 0, costGames: 0, weeks: 0 });
          t.actual += r.actual; t.best += r.best; t.weeks++;
          if (r.best - r.actual < 0.01) t.perfect++;
          if (r.score < r.oppScore && r.best > r.oppScore) t.costGames++;
          if (r.blunder) blunders.push({ ...r.blunder, teamId: r.teamId, week: r.week, lost: r.score < r.oppScore && r.score + r.blunder.cost > r.oppScore });
        }));
        const rows = Object.values(byTeam).map((t) => ({ ...t, left: t.best - t.actual, efficiency: t.best ? t.actual / t.best : 1 }))
          .sort((a, b) => b.efficiency - a.efficiency);
        blunders.sort((a, b) => b.cost - a.cost);
        return { weeks: boxes.map((b) => b.week).sort((a, b) => a - b), rows, blunders };
      }).catch((err) => { seasonLineups.delete(year); throw err; }));
    }
    return seasonLineups.get(year);
  }
  const blunderText = (b) => `benched ${b.benched.name} (${f2(b.benched.pts)}) for ${b.started.name} (${f2(b.started.pts)}), cost ${f2(b.cost)} pts${b.lost ? ", and the game" : ""}`;

  /* ================================================================
     Tools: worked out here, from the site's own files
     ================================================================ */

  class ToolError extends Error {}

  function toolkit(model) {
    const owners = model.owners;
    const name = (oid) => (owners[oid] ? owners[oid].name : "Unknown");
    const years = () => model.seasons.map((s) => s.year).join(", ");
    const seasonOf = (y) => {
      const s = model.season(y);
      if (!s) throw new ToolError(`There is no ${y} season on record. Seasons: ${years()}${y === 2020 ? " (only 2020's champion is kept: Charlie Vonderheid)" : ""}.`);
      return s;
    };
    const entries = [];
    Object.entries(owners).forEach(([oid, o]) => { if (!UNSPOKEN.has(oid)) entries.push([oid, norm(o.name)]); });
    model.seasons.forEach((s) => Object.values(s.teams).forEach((t) => { if (!UNSPOKEN.has(t.ownerId)) entries.push([t.ownerId, norm(t.name)]); }));
    const findManager = (q) => {
      const n = norm(q);
      if (!n) return null;
      const hit = entries.find(([, e]) => e === n) || entries.find(([, e]) => e.startsWith(n)) ||
        entries.find(([, e]) => e.includes(n)) || entries.find(([, e]) => n.includes(e) && e.length > 2);
      return hit ? hit[0] : null;
    };
    const managerOf = (q) => {
      const oid = findManager(q);
      if (!oid) throw new ToolError(`No manager or team ${unspoken(q) ? "by that name" : `called "${q}"`}. Managers: ${Object.entries(owners).filter(([id]) => !UNSPOKEN.has(id)).map(([, o]) => o.name).join(", ")}.`);
      return oid;
    };
    const teamIn = (s, oid) => Object.keys(s.teams).find((id) => s.teams[id].ownerId === oid) || null;
    const hidden = (s, id) => Boolean(s && s.teams[id] && UNSPOKEN.has(s.teams[id].ownerId));
    const who = (s, id) => (s.teams[id] ? `${name(s.teams[id].ownerId)} ("${String(s.teams[id].name).trim()}")` : `team ${id}`);
    const newest = () => model.seasons[model.seasons.length - 1];
    // A draft's ESPN team id -> the manager.
    const draftOwner = (espnId) => {
      const tid = ESPN_TEAM[espnId];
      const t = tid && newest().teams[tid];
      return t ? t.ownerId : null;
    };
    let playersJob = null;
    const playersDb = () => (playersJob = playersJob || getJSON("boxscores/players.json").then((idx) => {
      const out = (y, tid) => Boolean(idx.teams[y] && idx.teams[y][tid] && UNSPOKEN.has(idx.teams[y][tid][1]));
      const players = idx.players.map((p) => ({ ...p, r: p.r.filter(([y, , tid]) => !out(y, tid)) })).filter((p) => p.r.length);
      return { ...idx, players };
    }).catch((err) => { playersJob = null; throw err; }));
    const draftFile = (y) => getJSON(`drafts/${y}.json`).catch(() => null);
    const draftYears = () => model.seasons.map((s) => s.year).filter((y) => y >= 2024);
    const keepers = () => loadScript("keepers.js", () => Boolean(window.Keepers)).then(() => window.Keepers);

    async function box_score({ season, week, manager }) {
      const s = seasonOf(season);
      const weeks = await getJSON(`boxscores/${season}/index.json`).catch(() => []);
      if (!weeks.includes(week)) throw new ToolError(`No box scores for ${season} week ${week}. Weeks with box scores: ${weeks.join(", ") || "none"}.`);
      const box = await getJSON(`boxscores/${season}/week-${week}.json`);
      let list = box.games.filter((g) => !hidden(s, g.home) && !hidden(s, g.away));
      if (!list.length) throw new ToolError(`No box scores for ${season} week ${week}.`);
      if (manager) {
        const oid = managerOf(manager);
        const tid = teamIn(s, oid);
        list = list.filter((g) => g.home === tid || g.away === tid);
        if (!list.length) throw new ToolError(`${name(oid)} didn't play in ${season} week ${week}${week > s.regularWeeks ? " (a playoff bye, or out of it)" : ""}.`);
      }
      const label = (a, b) => {
        if (week <= s.regularWeeks) return null;
        const g = s.post.find((x) => x.week === week && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
        return g ? g.label : "consolation game";
      };
      const side = (g, tid, pts) => {
        const lu = g.lineups[tid] || [];
        const starters = lu.filter((p) => p.starter).map((p) => `${p.slot} ${p.name} (${p.pos}, ${p.nfl}) ${f2(p.pts)}${p.proj != null ? ` [proj ${f2(p.proj)}]` : ""}`);
        const bench = lu.filter((p) => !p.starter).map((p) => `${p.name} (${p.pos}${p.slot === "IR" ? ", IR" : ""}) ${f2(p.pts)}`);
        return `${who(s, tid)}: ${f2(pts)}\n  starters: ${starters.join("; ") || "none listed"}\n  bench: ${bench.join("; ") || "none"}`;
      };
      return list.map((g) => {
        const l = label(g.home, g.away);
        return `${season} week ${week}${l ? ` (${l})` : ""}\n${side(g, g.home, g.homeScore)}\n${side(g, g.away, g.awayScore)}`;
      }).join("\n\n");
    }

    async function player_history({ player }) {
      const idx = await playersDb();
      const q = norm(player);
      if (!q) throw new ToolError("Name a player.");
      const scored = idx.players.map((p) => {
        const n = norm(p.n);
        const last = n.split(" ").slice(1).join(" ");
        const score = n === q ? 4 : last === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) ? 1 : 0;
        return [score, p];
      }).filter(([sc]) => sc).sort((a, b) => b[0] - a[0] || b[1].r.length - a[1].r.length);
      if (!scored.length) throw new ToolError(`No player matching "${player}" has been on a roster in this league.`);
      const p = scored[0][1];
      const others = scored.slice(1, 6).map(([, x]) => `${x.n} (${x.p})`);
      const team = (y, tid) => idx.teams[y] && idx.teams[y][tid];
      const groups = new Map();
      p.r.forEach(([year, week, teamId, slot, pts]) => {
        const key = `${year}|${teamId}`;
        if (!groups.has(key)) groups.set(key, { year, teamId, weeks: 0, starts: 0, pts: 0, bench: 0, best: null, first: week, last: week });
        const g = groups.get(key);
        g.weeks++; g.last = week;
        if (BENCH.has(slot)) g.bench += pts;
        else { g.starts++; g.pts += pts; if (!g.best || pts > g.best.pts) g.best = { week, pts }; }
      });
      const lines = [`${p.n} (${p.p}) in this league:`];
      [...groups.values()].sort((a, b) => a.year - b.year || a.first - b.first).forEach((g) => {
        const t = team(g.year, g.teamId);
        lines.push(`- ${g.year}, ${t ? `${t[2]} ("${t[0]}")` : g.teamId}, weeks ${g.first}–${g.last}: on the roster ${plural(g.weeks, "week")}, started ${g.starts} for ${f2(g.pts)} pts${g.starts ? ` (${f2(g.pts / g.starts)}/start, best ${f2(g.best.pts)} in week ${g.best.week})` : ""}; ${f2(g.bench)} pts on the bench`);
      });
      const best = p.r.filter((r) => !BENCH.has(r[3])).sort((a, b) => b[4] - a[4]).slice(0, 5);
      if (best.length) {
        lines.push(`Best starts: ${best.map(([y, w, tid, , pts]) => `${f2(pts)} (${y} wk ${w}, ${team(y, tid) ? team(y, tid)[2] : tid})`).join("; ")}`);
      }
      // How he got there, where the drafts reach (2024 on), and whether he
      // can be kept.
      const pn = pnorm(p.n);
      const drafted = [];
      for (const y of draftYears()) {
        const d = await draftFile(y);
        const pk = d && d.picks.find((x) => pnorm(x.player) === pn);
        if (pk) drafted.push(`${y}: ${pk.keeper ? "kept" : "drafted"} by ${name(draftOwner(pk.team))}, round ${pk.round} (#${pk.overall} overall)`);
      }
      if (drafted.length) lines.push(`Drafts: ${drafted.join("; ")}`);
      else if (draftYears().length) lines.push("Not taken in any draft on record (2024 on): any team he played for since then picked him up.");
      try {
        const K = await keepers();
        const st = await K.statuses();
        const v = st.get(p.n);
        if (v) lines.push(`Keeper status for ${K.KEEP_YEAR}: ${v.level === "out" ? `can't be kept (${v.tag})` : v.level === "last" ? "can be kept one more year" : "can be kept"}.`);
      } catch (err) { /* keeper rules unavailable */ }
      if (others.length) lines.push(`Other players matching "${player}": ${others.join(", ")}`);
      return lines.join("\n");
    }

    async function team_season({ season, manager }) {
      const s = seasonOf(season);
      const oid = managerOf(manager);
      const tid = teamIn(s, oid);
      if (!tid) throw new ToolError(`${name(oid)} didn't play in ${season}.`);
      const t = s.teams[tid];
      const lines = [`${name(oid)} in ${season}, as "${String(t.name).trim()}": ${record(t)}, PF ${f2(t.pf)}, PA ${f2(t.pa)}, ${t.division} division${s.finished ? `, finished ${t.finalRank}` : ` (season in progress, through week ${s.throughWeek})`}.`];
      const results = [];
      s.regular.slice().sort((a, b) => a.week - b.week).forEach((g) => {
        if (g.a !== tid && g.b !== tid) return;
        if (hidden(s, g.a) || hidden(s, g.b)) return;
        const mine = g.a === tid ? g.aScore : g.bScore, theirs = g.a === tid ? g.bScore : g.aScore, opp = g.a === tid ? g.b : g.a;
        results.push(`wk ${g.week} ${mine > theirs ? "W" : mine < theirs ? "L" : "T"} ${f2(mine)}–${f2(theirs)} vs ${name(s.teams[opp].ownerId)}`);
      });
      s.post.filter((g) => (g.a === tid || g.b === tid) && !hidden(s, g.a) && !hidden(s, g.b)).sort((a, b) => a.week - b.week).forEach((g) => {
        const mine = g.a === tid ? g.aScore : g.bScore, theirs = g.a === tid ? g.bScore : g.aScore, opp = g.a === tid ? g.b : g.a;
        results.push(`wk ${g.week} ${g.label}: ${mine > theirs ? "W" : "L"} ${f2(mine)}–${f2(theirs)} vs ${s.teams[opp] ? name(s.teams[opp].ownerId) : "?"}`);
      });
      lines.push(`Games: ${results.join("; ") || "none yet"}`);
      const roster = await getJSON(`boxscores/${season}/roster.json`).catch(() => null);
      const mine = roster && roster[tid];
      if (mine && mine.players.length) {
        lines.push(`Players started (starts, points as a starter): ${mine.players.slice(0, 30).map((p) => `${p.name} (${p.pos}) ${p.starts}, ${f2(p.pts)}`).join("; ")}`);
      }
      try {
        const ls = await lineupSeason(season);
        const named = ls.rows.filter((r) => !hidden(s, r.teamId));
        const row = named.find((r) => r.teamId === tid);
        if (row) {
          lines.push(`Lineup efficiency: ${pct(row.efficiency)} (${named.indexOf(row) + 1} of ${named.length}), ${f2(row.left)} pts left on the bench, ${row.perfect} of ${row.weeks} weeks perfect, ${plural(row.costGames, "game")} lost to lineup choices.`);
          const worst = ls.blunders.filter((b) => b.teamId === tid).slice(0, 3);
          if (worst.length) lines.push(`Worst benchings: ${worst.map((b) => `week ${b.week}: ${blunderText(b)}`).join("; ")}`);
        }
      } catch (err) { /* lineups unavailable */ }
      return lines.join("\n");
    }

    async function top_performances({ season, position, manager, limit }) {
      const idx = await playersDb();
      if (season) seasonOf(season);
      const oid = manager ? managerOf(manager) : null;
      const pos = position ? String(position).toUpperCase().replace("D/ST", "DST").replace("DEF", "DST") : null;
      const n = Math.max(1, Math.min(40, Number(limit) || 15));
      const starts = [], benched = [];
      idx.players.forEach((p) => {
        if (pos && p.p !== pos) return;
        p.r.forEach(([y, w, tid, slot, pts]) => {
          if (season && y !== season) return;
          const t = idx.teams[y] && idx.teams[y][tid];
          if (oid && (!t || t[1] !== oid)) return;
          (slot === "IR" ? [] : BENCH.has(slot) ? benched : starts).push({ p, y, w, t, pts });
        });
      });
      const line = (x, i) => `${i + 1}. ${x.p.n} (${x.p.p}) ${f2(x.pts)}, ${x.y} wk ${x.w}, ${x.t ? `${x.t[2]} ("${x.t[0]}")` : "?"}`;
      const scope = `${season || "all seasons"}${pos ? `, ${pos}` : ""}${oid ? `, ${name(oid)}'s teams` : ""}`;
      return [
        `Best starts (${scope}):`, ...starts.sort((a, b) => b.pts - a.pts).slice(0, n).map(line),
        `Best weeks left on a bench (${scope}):`, ...benched.sort((a, b) => b.pts - a.pts).slice(0, Math.min(n, 8)).map(line),
      ].join("\n");
    }

    async function draft({ season }) {
      seasonOf(season);
      const d = await draftFile(season);
      if (!d) return `No draft is on record for ${season}: the site keeps the drafts from 2024 on${season === 2022 ? " (2022 was drafted on Sleeper)" : ""}.`;
      const s = model.season(season);
      const roster = await getJSON(`boxscores/${season}/roster.json`).catch(() => null);
      const lines = [`${season} draft: ${d.keepers ? `rounds 1-${d.keepers} are keepers, the open draft starts in round ${d.keepers + 1}` : "no keepers"}. Pick: manager: player (position) → points he scored as that manager's starter that season.`];
      d.picks.slice().sort((a, b) => a.overall - b.overall).forEach((pk) => {
        const oid = draftOwner(pk.team);
        const tid = oid && s ? teamIn(s, oid) : null;
        const got = roster && tid && roster[tid] && roster[tid].players.find((x) => pnorm(x.name) === pnorm(pk.player));
        lines.push(`${pk.round}.${String(pk.pick).padStart(2, "0")} (#${pk.overall}) ${oid ? name(oid) : `team ${pk.team}`}: ${pk.player} (${pk.pos})${pk.keeper ? " [keeper]" : ""}${got ? ` → ${f2(got.pts)} in ${plural(got.starts, "start")}` : " → 0 starts"}`);
      });
      return lines.join("\n");
    }

    async function keepers_({ manager }) {
      const K = await keepers();
      const data = await K.load();
      const s = model.season(K.SEASON);
      const oid = manager ? managerOf(manager) : null;
      const lines = [
        `Keepers for ${K.KEEP_YEAR}, judged from the ${K.SEASON} draft and rosters as of week ${data.latest}. The rules: up to 3 keepers a team, taken in the first rounds of the next draft. A player taken in the first two open rounds can't be kept the next year. Three straight years is the limit (drafted or picked up, kept, kept again), and the clock follows the player, not the team.`,
      ];
      Object.entries(data.rosters).forEach(([tid, lineup]) => {
        const t = s && s.teams[tid];
        if (oid && (!t || t.ownerId !== oid)) return;
        const rows = lineup.map((p) => ({ p, v: K.judge(p.name, data.drafts), pts: data.points ? data.points[p.name] || 0 : 0 }))
          .sort((a, b) => b.pts - a.pts);
        lines.push(`${t ? who(s, tid) : tid}:`);
        rows.forEach(({ p, v, pts }) => lines.push(`  ${p.name} (${p.pos}) ${f2(pts)} pts this season: ${v.level === "out" ? `can't be kept (${v.tag})` : v.level === "last" ? "can be kept, final year" : "can be kept"}`));
      });
      if (lines.length === 1) return `No roster found${oid ? ` for ${name(oid)}` : ""}.`;
      return lines.join("\n");
    }

    async function roster_moves({ season, manager }) {
      const s = seasonOf(season);
      const oid = manager ? managerOf(manager) : null;
      const idx = await playersDb();
      const teamName = (tid) => (s.teams[tid] ? name(s.teams[tid].ownerId) : tid);
      // Each team's first week with a box score: who was on it then came
      // from the draft (or was kept).
      const firstWeek = {};
      idx.players.forEach((p) => p.r.forEach(([y, w, tid]) => {
        if (y === season && (firstWeek[tid] == null || w < firstWeek[tid])) firstWeek[tid] = w;
      }));
      const moves = [];
      idx.players.forEach((p) => {
        const rows = p.r.filter((r) => r[0] === season).sort((a, b) => a[1] - b[1]);
        const stints = [];
        rows.forEach(([, w, tid, slot, pts]) => {
          let st = stints[stints.length - 1];
          if (!st || st.tid !== tid) stints.push((st = { tid, from: w, to: w, starts: 0, pts: 0 }));
          st.to = w;
          if (!BENCH.has(slot)) { st.starts++; st.pts += pts; }
        });
        stints.forEach((st, i) => {
          if (i === 0 && st.from === firstWeek[st.tid]) return;
          const prev = stints[i - 1];
          const kind = prev && prev.to >= st.from - 1 ? "moved" : "pickup";
          moves.push({ p, st, kind, prev });
        });
      });
      const list = moves.filter((m) => !oid || (s.teams[m.st.tid] && s.teams[m.st.tid].ownerId === oid) || (m.prev && s.teams[m.prev.tid] && s.teams[m.prev.tid].ownerId === oid))
        .sort((a, b) => b.st.pts - a.st.pts);
      if (!list.length) return `No roster moves show up in the ${season} lineups${oid ? ` for ${name(oid)}` : ""}.`;
      const lines = [`${season} roster moves${oid ? ` involving ${name(oid)}` : ""}, from the weekly lineups (the site doesn't record transactions, so "moved" can be a trade or a drop and a claim). By points scored for the new team:`];
      list.slice(0, 40).forEach((m, i) => {
        const how = m.kind === "moved" ? `moved from ${teamName(m.prev.tid)} to ${teamName(m.st.tid)} in week ${m.st.from}`
          : `picked up by ${teamName(m.st.tid)} in week ${m.st.from}${m.prev ? ` (was on ${teamName(m.prev.tid)} earlier)` : ""}`;
        lines.push(`${i + 1}. ${m.p.n} (${m.p.p}): ${how}; ${f2(m.st.pts)} pts in ${plural(m.st.starts, "start")} for them`);
      });
      if (list.length > 40) lines.push(`…and ${list.length - 40} more.`);
      const totals = {};
      list.forEach((m) => {
        const t = (totals[m.st.tid] = totals[m.st.tid] || { adds: 0, pts: 0, hits: 0 });
        t.adds++; t.pts += m.st.pts; if (m.st.starts >= 3) t.hits++;
      });
      lines.push("By manager (players added during the season):");
      Object.entries(totals).sort((a, b) => b[1].pts - a[1].pts)
        .forEach(([tid, t]) => lines.push(`- ${teamName(tid)}: ${t.adds} added, ${f2(t.pts)} pts from them, ${t.hits} started 3+ times`));
      return lines.join("\n");
    }

    async function lineup_efficiency({ season }) {
      if (season) {
        const s = seasonOf(season);
        const ls = await lineupSeason(season);
        if (!ls.rows.length) return `No lineups are recorded for ${season}.`;
        const lines = [`${season} lineup efficiency (points scored ÷ best possible lineup), weeks ${ls.weeks[0]}–${ls.weeks[ls.weeks.length - 1]}, playoffs and Toilet Bowl included:`];
        ls.rows.filter((r) => !hidden(s, r.teamId)).forEach((r, i) => lines.push(`${i + 1}. ${s.teams[r.teamId] ? name(s.teams[r.teamId].ownerId) : r.teamId}: ${pct(r.efficiency)}, ${f2(r.left)} pts left on the bench, ${r.perfect} of ${r.weeks} weeks perfect, ${plural(r.costGames, "game")} lost to lineup choices`));
        lines.push("Costliest benchings:");
        ls.blunders.filter((b) => !hidden(s, b.teamId)).slice(0, 8).forEach((b) => lines.push(`- week ${b.week}, ${s.teams[b.teamId] ? name(s.teams[b.teamId].ownerId) : "?"}: ${blunderText(b)}`));
        return lines.join("\n");
      }
      const all = {};
      const worst = [];
      for (const s of model.seasons) {
        const ls = await lineupSeason(s.year).catch(() => null);
        if (!ls) continue;
        ls.rows.forEach((r) => {
          const o = s.teams[r.teamId] && s.teams[r.teamId].ownerId;
          if (!o || UNSPOKEN.has(o)) return;
          const a = (all[o] = all[o] || { seasons: 0, weeks: 0, actual: 0, best: 0, costGames: 0 });
          a.seasons++; a.weeks += r.weeks; a.actual += r.actual; a.best += r.best; a.costGames += r.costGames;
        });
        ls.blunders.filter((b) => !hidden(s, b.teamId)).slice(0, 5).forEach((b) => worst.push({ ...b, year: s.year, oid: s.teams[b.teamId] && s.teams[b.teamId].ownerId }));
      }
      const rows = Object.entries(all).map(([o, a]) => ({ o, ...a, efficiency: a.best ? a.actual / a.best : 1 })).sort((a, b) => b.efficiency - a.efficiency);
      if (!rows.length) return "No lineups are recorded.";
      return ["All-time lineup efficiency (points scored ÷ best possible lineup, playoffs included):",
        ...rows.map((r, i) => `${i + 1}. ${name(r.o)}: ${pct(r.efficiency)} over ${plural(r.seasons, "season")} (${r.weeks} weeks), ${f2(r.best - r.actual)} pts left on the bench, ${r.costGames} games lost to lineup choices`),
        "Costliest benchings ever:",
        ...worst.sort((a, b) => b.cost - a.cost).slice(0, 8).map((b) => `- ${b.year} week ${b.week}, ${name(b.oid)}: ${blunderText(b)}`)].join("\n");
    }

    async function weekly_recaps({ season, week }) {
      seasonOf(season);
      const page = await seasonPage(season);
      const all = page.weeklySummaries || {};
      const weeks = Object.keys(all).map(Number).sort((a, b) => a - b).filter((w) => week == null || w === week);
      if (!weeks.length) return week == null ? `No written recaps on the ${season} page.` : `No recap for ${season} week ${week}. Recaps: weeks ${Object.keys(all).join(", ")}.`;
      return weeks.map((w) => {
        const r = all[w];
        const body = (r.bullets || r.body || []).filter((x) => !unspoken(plain(x))).map((x) => `- ${plain(x)}`).join("\n");
        const head = unspoken(plain(r.headline)) ? "" : plain(r.headline);
        return `${season} ${w === 0 ? "preseason" : `week ${w}`}${head ? `: ${head}` : ""}\n${body}`;
      }).join("\n\n");
    }

    return { box_score, player_history, team_season, top_performances, draft, keepers: keepers_, roster_moves, lineup_efficiency, weekly_recaps };
  }

  // Every tool's input, checked before it runs: the AI's input is data, and
  // a wrong type gets an error back rather than a wrong answer.
  const INT = (v, lo, hi) => {
    const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
    return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
  };
  const STR = (v) => (typeof v === "string" && v.trim() && v.length <= 80 ? v.trim() : undefined);
  const SCHEMA = {
    box_score: { season: [INT, true, 1990, 2100], week: [INT, true, 0, 30], manager: [STR, false] },
    player_history: { player: [STR, true] },
    team_season: { season: [INT, true, 1990, 2100], manager: [STR, true] },
    top_performances: { season: [INT, false, 1990, 2100], position: [STR, false], manager: [STR, false], limit: [INT, false, 1, 100] },
    draft: { season: [INT, true, 1990, 2100] },
    keepers: { manager: [STR, false] },
    roster_moves: { season: [INT, true, 1990, 2100], manager: [STR, false] },
    lineup_efficiency: { season: [INT, false, 1990, 2100] },
    weekly_recaps: { season: [INT, true, 1990, 2100], week: [INT, false, 0, 30] },
  };
  function checkInput(tool, input) {
    const schema = SCHEMA[tool];
    if (!schema) throw new ToolError(`There is no tool called ${tool}.`);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ToolError("The input must be an object.");
    const out = {};
    for (const [key, [type, required, lo, hi]] of Object.entries(schema)) {
      const raw = input[key];
      if (raw == null || raw === "") {
        if (required) throw new ToolError(`"${key}" is required.`);
        continue;
      }
      const v = type(raw, lo, hi);
      if (v === undefined) throw new ToolError(`"${key}" isn't valid: ${JSON.stringify(raw).slice(0, 60)}.`);
      out[key] = v;
    }
    return out;
  }

  /* ================================================================
     Talking to the sluh22-chat function
     ================================================================ */

  class ChatError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }
  const passcode = {
    get() { try { return localStorage.getItem(PASS_KEY) || ""; } catch (err) { return ""; } },
    set(v) { try { if (v) localStorage.setItem(PASS_KEY, v); else localStorage.removeItem(PASS_KEY); } catch (err) { /* blocked */ } },
  };

  async function post(body, signal, onEvent) {
    const headers = { "Content-Type": "application/json" };
    const code = passcode.get();
    if (code) headers["x-league-passcode"] = code;
    let res;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body), signal });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      throw new ChatError("The League Historian didn't answer. Check your connection and try again.", "network");
    }
    if (!res.ok) {
      let answer = {};
      try { answer = await res.json(); } catch (err) { /* not JSON */ }
      // No function there at all: it hasn't been deployed yet.
      if (res.status === 404 && !answer.code) throw new ChatError("", "not_set_up");
      const msg = answer.error ? answer.error.charAt(0).toUpperCase() + answer.error.slice(1) + "." : `The League Historian answered ${res.status}.`;
      throw new ChatError(msg, answer.code || `http_${res.status}`);
    }
    // Server-sent events, one JSON object per `data:` line.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", done = null;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch (err) { continue; }
        if (event.t === "error") throw new ChatError(event.message || "The League Historian couldn't answer that.", event.setup ? "not_set_up_upstream" : "upstream");
        if (event.t === "done") done = event;
        else onEvent(event);
      }
      if (end) break;
    }
    if (!done) throw new ChatError("The answer was cut off. Try again.", "cut_off");
    return done;
  }

  /* ================================================================
     Markdown, safely: everything is escaped first, then a small set of
     marks is turned back on.
     ================================================================ */

  function inline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  }

  function markdown(src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    const out = [];
    let i = 0;
    const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
    const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { out.push(`<h4>${inline(h[2])}</h4>`); i++; continue; }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
      if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<div class="lhc-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
          i++;
        }
        out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
        continue;
      }
      // A paragraph always takes its first line (a table row whose
      // separator hasn't streamed in yet reads as text for now).
      const para = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !isTableRow(lines[i])) {
        para.push(lines[i++]);
      }
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    }
    return out.join("");
  }

  /* ================================================================
     The chat window
     ================================================================ */

  const ICON = {
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l1.9 5.3 5.3 1.9-5.3 1.9L12 17.2l-1.9-5.3L4.8 10l5.3-1.9z"/><path d="M18.6 14.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    fresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
    ball: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="32" rx="25" ry="15" transform="rotate(-35 32 32)"/><path d="M22 42L42 22M27 31l6 6M31 27l6 6M23 35l6 6M35 23l6 6" class="lhc-laces"/></svg>',
  };

  const WORKING = {
    start: ["Reading the record book", "Flipping through old seasons", "Checking the standings"],
    box_score: "Pulling the box scores",
    player_history: "Tracing a player's history",
    team_season: "Going through that season",
    top_performances: "Searching the best weeks",
    draft: "Opening the draft board",
    keepers: "Checking the keeper rules",
    roster_moves: "Combing the waiver wire",
    lineup_efficiency: "Grading lineups",
    weekly_recaps: "Reading the weekly recaps",
  };

  function suggestions(model) {
    const out = ["Who has won the most championships?"];
    const n = {};
    gamesOf(model).forEach((g) => { const k = [g.aOwner, g.bOwner].sort().join("|"); n[k] = (n[k] || 0) + 1; });
    const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [x, y] = top[0].split("|");
      out.push(`${model.owners[x].name} vs ${model.owners[y].name}: who owns the rivalry?`);
    }
    const live = model.seasons.find((s) => s.live && s.throughWeek);
    if (live) out.push(`Who's been the unluckiest team in ${live.year}?`);
    else out.push("What's the highest score in league history?");
    out.push("Who leaves the most points on the bench?");
    return out;
  }

  function mount() {
    let model = null;
    let tools = null;
    let digestJob = null;
    const ready = () => league().then((m) => { if (!model) { model = m; tools = toolkit(m); } return m; });
    const digest = () => (digestJob = digestJob || ready().then(digestOf).catch((err) => { digestJob = null; throw err; }));
    let history = [];   // what the API sees: every turn, tool calls included
    let shown = [];     // what the visitor sees: { role, text, error? }
    let busy = null;    // the AbortController of the answer being written
    let opened = false;

    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
      if (saved && saved.v === 1) { history = saved.history || []; shown = saved.shown || []; }
    } catch (err) { /* nothing saved */ }
    const save = () => {
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, history, shown })); } catch (err) { /* full or blocked */ }
    };

    /* ---- the button ---- */
    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "lhc-fab";
    fab.setAttribute("aria-haspopup", "dialog");
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-label", "Ask the League: chat with the league's AI historian");
    fab.innerHTML = `<span class="lhc-fab-ring" aria-hidden="true"></span>
      <span class="lhc-fab-icon">${ICON.spark}</span>
      <span class="lhc-fab-label">Ask the League</span>`;
    document.body.appendChild(fab);
    requestAnimationFrame(() => fab.classList.add("in"));

    /* ---- the panel ---- */
    const panel = document.createElement("section");
    panel.className = "lhc-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", "Ask the League");
    panel.hidden = true;
    panel.innerHTML = `
      <header class="lhc-head">
        <div class="lhc-head-glow" aria-hidden="true"></div>
        <div class="lhc-head-avatar"><img src="icons/crest.png" alt="" width="42" height="42"><span class="lhc-head-spark">${ICON.spark}</span></div>
        <div class="lhc-head-copy">
          <span class="lhc-kicker">${esc(LEAGUE)}</span>
          <h2>League Historian</h2>
        </div>
        <button type="button" class="lhc-icon-btn" data-act="fresh" aria-label="New chat" title="New chat">${ICON.fresh}</button>
        <button type="button" class="lhc-icon-btn" data-act="close" aria-label="Close">${ICON.close}</button>
      </header>
      <div class="lhc-body"><div class="lhc-log" role="log" aria-live="polite"></div></div>
      <form class="lhc-compose">
        <textarea rows="1" maxlength="1000" placeholder="Ask about any season, rivalry…" aria-label="Your question"></textarea>
        <button type="submit" class="lhc-send" aria-label="Send">${ICON.send}</button>
      </form>
      <p class="lhc-fine">The AI can get things wrong. Check the record book for anything that matters.</p>`;
    document.body.appendChild(panel);

    const log = panel.querySelector(".lhc-log");
    const body = panel.querySelector(".lhc-body");
    const form = panel.querySelector(".lhc-compose");
    const input = form.querySelector("textarea");
    const send = form.querySelector(".lhc-send");

    const scrollDown = (smooth = true) => {
      body.scrollTo({ top: body.scrollHeight, behavior: smooth && !REDUCE.matches ? "smooth" : "auto" });
    };
    const nearBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight < 120;

    function open() {
      if (opened) return;
      opened = true;
      draw();
      panel.hidden = false;
      fab.setAttribute("aria-expanded", "true");
      document.documentElement.classList.add("lhc-open");
      const r = fab.getBoundingClientRect();
      panel.style.setProperty("--from-x", `${r.left + r.width / 2}px`);
      panel.style.setProperty("--from-y", `${r.top + r.height / 2}px`);
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add("open")));
      digest().then(() => { if (opened && !busy && !shown.length) draw(); }).catch(() => { /* asked again on the first question */ });
      setTimeout(() => { if (!PHONE.matches) input.focus({ preventScroll: true }); if (shown.length) scrollDown(false); }, 60);
    }
    function close() {
      if (!opened) return;
      opened = false;
      panel.classList.remove("open");
      fab.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("lhc-open");
      const done = () => { if (!opened) panel.hidden = true; };
      if (REDUCE.matches) done(); else setTimeout(done, 380);
      fab.focus({ preventScroll: true });
    }
    fab.addEventListener("click", () => (opened ? close() : open()));
    panel.querySelector('[data-act="close"]').addEventListener("click", close);
    panel.querySelector('[data-act="fresh"]').addEventListener("click", () => {
      if (busy) busy.abort();
      history = [];
      shown = [];
      save();
      draw();
      input.focus({ preventScroll: true });
    });
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    /* ---- drawing ---- */
    function bubble(m, i) {
      if (m.role === "user") return `<div class="lhc-msg lhc-user" style="--i:${i}"><div class="lhc-bubble">${esc(m.text)}</div></div>`;
      let inner = markdown(m.text);
      if (m.passcode) {
        inner = `<p>${esc(m.text)}</p>
          <div class="lhc-pass-form">
            <input type="password" autocomplete="off" placeholder="League passcode" aria-label="League passcode">
            <button type="button" class="lhc-retry" data-act="passcode">${ICON.lock}<span>Unlock</span></button>
          </div>`;
      } else if (m.error) {
        inner = `<p>${esc(m.text)}</p>${m.retry ? '<button type="button" class="lhc-retry" data-act="retry">Try again</button>' : ""}`;
      }
      return `<div class="lhc-msg lhc-ai" style="--i:${i}">
        <span class="lhc-ai-mark" aria-hidden="true">${ICON.spark}</span>
        <div class="lhc-bubble${m.error ? " lhc-bubble-error" : ""}">${inner}</div>
      </div>`;
    }

    function welcome() {
      const chips = model ? suggestions(model) : [];
      return `<div class="lhc-welcome">
        <div class="lhc-orb" aria-hidden="true">
          <span class="lhc-orb-ball">${ICON.ball}</span>
          <span class="lhc-orbit"><i></i><i></i><i></i></span>
        </div>
        <h3>Ask me anything about ${esc(LEAGUE)}</h3>
        <p>Every season, game, draft, keeper and box score in the league's history. Rivalries, records, who choked, who left 30 on the bench.</p>
        <div class="lhc-chips">${chips.map((q, i) => `<button type="button" class="lhc-chip" style="--i:${i}" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      </div>`;
    }

    // The last question asked, to ask again after an error.
    const lastQuestion = () => (shown.length >= 2 && shown[shown.length - 2].role === "user" ? shown[shown.length - 2].text : null);

    function draw() {
      panel.querySelector('[data-act="fresh"]').hidden = !shown.length;
      log.innerHTML = shown.length ? shown.map(bubble).join("") : welcome();
      log.querySelectorAll(".lhc-chip").forEach((b) => b.addEventListener("click", () => ask(b.dataset.q)));
      const retry = log.querySelector('[data-act="retry"]');
      if (retry) retry.addEventListener("click", () => {
        const q = lastQuestion();
        if (!q) return;
        shown = shown.slice(0, -2);
        ask(q);
      });
      const unlock = log.querySelector('[data-act="passcode"]');
      if (unlock) {
        const field = unlock.previousElementSibling;
        const go = () => {
          if (!field.value.trim()) { field.focus(); return; }
          passcode.set(field.value.trim());
          const q = lastQuestion();
          shown = shown.slice(0, -2);
          if (q) ask(q); else draw();
        };
        unlock.addEventListener("click", go);
        field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
        if (!PHONE.matches) setTimeout(() => field.focus({ preventScroll: true }), 80);
      }
      if (shown.length >= MAX_TURNS / 2 || history.length >= MAX_TURNS) {
        log.insertAdjacentHTML("beforeend", '<div class="lhc-note">This chat is getting long. Start a new one (↻ above) to keep going.</div>');
      }
      updateSend();
    }

    function updateSend() {
      const full = history.length >= MAX_TURNS;
      send.classList.toggle("is-stop", Boolean(busy));
      send.innerHTML = busy ? ICON.stop : ICON.send;
      send.setAttribute("aria-label", busy ? "Stop" : "Send");
      send.disabled = !busy && (!input.value.trim() || full);
      input.disabled = full && !busy;
    }

    const autosize = () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(140, input.scrollHeight)}px`;
    };
    input.addEventListener("input", () => { autosize(); updateSend(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (busy) { busy.abort(); return; }
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      autosize();
      ask(q);
    });

    /* ---- asking ---- */
    async function ask(question) {
      if (busy || history.length >= MAX_TURNS) return;
      const mark = history.length;
      const markShown = shown.length;
      history.push({ role: "user", content: question });
      shown.push({ role: "user", text: question });
      if (log.querySelector(".lhc-welcome, .lhc-note") || !log.querySelector(".lhc-msg")) log.innerHTML = shown.slice(0, -1).map(bubble).join("");
      panel.querySelector('[data-act="fresh"]').hidden = false;
      log.insertAdjacentHTML("beforeend", bubble(shown[shown.length - 1], 0));

      // The answer's bubble: a status line while it works, then the words.
      log.insertAdjacentHTML("beforeend", `<div class="lhc-msg lhc-ai is-working">
        <span class="lhc-ai-mark" aria-hidden="true">${ICON.spark}</span>
        <div class="lhc-bubble"><div class="lhc-status"><span class="lhc-dots"><i></i><i></i><i></i></span><span class="lhc-status-text">${WORKING.start[0]}…</span></div><div class="lhc-answer"></div></div>
      </div>`);
      const msgEl = log.lastElementChild;
      const statusEl = msgEl.querySelector(".lhc-status-text");
      const answerEl = msgEl.querySelector(".lhc-answer");
      scrollDown();

      let text = "";
      let frame = 0;
      const paint = () => {
        frame = 0;
        const follow = nearBottom();
        answerEl.innerHTML = markdown(text) + '<span class="lhc-caret" aria-hidden="true"></span>';
        msgEl.classList.toggle("has-text", Boolean(text));
        if (follow) scrollDown(false);
      };
      const setStatus = (words) => {
        if (statusEl.textContent === `${words}…`) return;
        statusEl.textContent = `${words}…`;
        statusEl.classList.remove("swap");
        void statusEl.offsetWidth; // restart the fade
        statusEl.classList.add("swap");
      };
      let tick = 0;
      const cycler = setInterval(() => { if (!text) setStatus(WORKING.start[++tick % WORKING.start.length]); }, 2600);

      busy = new AbortController();
      updateSend();
      try {
        let leagueText;
        try { leagueText = await digest(); } catch (err) {
          throw new ChatError("Couldn't read the league's files. Check your connection and try again.", "data");
        }
        for (let round = 0; ; round++) {
          if (round > MAX_TOOL_ROUNDS) throw new ChatError("That one needed too many look-ups. Try asking it more narrowly.", "too_many_steps");
          if (text && !/\n\n$/.test(text)) text += "\n\n";
          const done = await post({ digest: leagueText, messages: history }, busy.signal, (event) => {
            if (event.t === "text") {
              text += event.d;
              if (!frame) frame = requestAnimationFrame(paint);
            } else if (event.t === "tool") {
              setStatus(WORKING[event.name] || "Looking it up");
              msgEl.classList.add("is-looking");
            }
          });
          if (done.stop === "refusal") throw new ChatError("The League Historian won't answer that one. Try asking another way.", "refusal");
          // An empty turn can't be sent back next time; it stands as a line.
          const content = Array.isArray(done.content) && done.content.length ? done.content
            : [{ type: "text", text: "I couldn't find an answer to that." }];
          const uses = content.filter((b) => b.type === "tool_use");
          if (done.stop === "max_tokens" && uses.length) throw new ChatError("That answer ran too long. Try asking something narrower.", "max_tokens");
          history.push({ role: "assistant", content });
          if (done.stop !== "tool_use" || !uses.length) break;
          // The AI asked for detail: work it out here and send it back,
          // every result in one turn.
          msgEl.classList.add("is-looking");
          const results = await Promise.all(uses.map(async (u) => {
            try {
              if (!tools[u.name]) throw new ToolError(`There is no tool called ${u.name}.`);
              const out = await tools[u.name](checkInput(u.name, u.input));
              return { type: "tool_result", tool_use_id: u.id, content: unsaid(out).slice(0, 40000) };
            } catch (err) {
              const known = err instanceof ToolError;
              if (!known) console.warn("Ask the League tool:", u.name, err);
              return { type: "tool_result", tool_use_id: u.id, is_error: true, content: known ? unsaid(err.message) : "That couldn't be worked out from the league's files." };
            }
          }));
          history.push({ role: "user", content: results });
          msgEl.classList.remove("is-looking");
          setStatus("Writing it up");
        }
        if (frame) cancelAnimationFrame(frame);
        clearInterval(cycler);
        const final = text.trim() || "I couldn't find an answer to that in the league's history.";
        shown.push({ role: "assistant", text: final });
        save();
        msgEl.classList.remove("is-working", "is-looking");
        msgEl.classList.add("is-done");
        answerEl.innerHTML = markdown(final);
        msgEl.querySelector(".lhc-status").remove();
      } catch (err) {
        if (frame) cancelAnimationFrame(frame);
        clearInterval(cycler);
        // The question and anything after it come off the conversation, so
        // the next one starts clean.
        history.length = mark;
        if (err.name === "AbortError") {
          // What was written so far stays on screen, marked as stopped; the
          // AI won't see it.
          shown.length = markShown;
          if (text.trim()) shown.push({ role: "user", text: question }, { role: "assistant", text: `${text.trim()}\n\n*(stopped)*` });
        } else if (err.code === "passcode") {
          const had = passcode.get();
          passcode.set("");
          shown.push({ role: "assistant", error: true, passcode: true,
            text: had ? "That passcode didn't work. Ask the commissioner for the current one." : "The Historian only talks to the league. Enter the league passcode (ask the commissioner) and it'll answer." });
        } else {
          const message = err.code === "not_set_up" ? "The League Historian isn't switched on yet. (Commissioner: deploy supabase/functions/sluh22-chat.)" : err.message || "Something went wrong. Try again.";
          shown.push({ role: "assistant", text: message, error: true, retry: !["not_set_up", "not_set_up_upstream", "daily_limit", "origin"].includes(err.code) });
        }
        save();
        draw();
        scrollDown();
      } finally {
        busy = null;
        updateSend();
        if (opened && !PHONE.matches && !log.querySelector(".lhc-pass-form")) input.focus({ preventScroll: true });
      }
    }

    // A chat already under way on another page opens where it left off.
    if (shown.length && sessionStorage.getItem(`${STORE_KEY}:open`) === "1") open();
    addEventListener("pagehide", () => {
      try { sessionStorage.setItem(`${STORE_KEY}:open`, opened ? "1" : "0"); } catch (err) { /* blocked */ }
    });
  }

  function start() {
    if (document.querySelector(".lhc-fab")) return;
    mount();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);

  // For tests and the curious: the text the AI is given about the league.
  window.LeagueChat = { league, digestOf, toolkit, markdown, lineupWeek };
})();
