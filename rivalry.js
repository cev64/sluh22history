/* Ported from Pigskin Pantheon (leaguehistoryapp insights.js) unchanged; the season
   pages hand it a small model built from LEAGUE_DATA and the page's own season. */

/* The rivalry preview: one game between two managers, read against the
   league's whole history.

     Insights.rivalry(model, year, week, a, b, { records })
       a, b      the game's team ids that season ("r3"); each is followed
                 to its manager (team.ownerId), the way the record book
                 follows managers across seasons (model.leagueData())
       records   optional { teamId: "5–3" }, the records going in as the
                 page already shows them

   Answers plain data (the app's bridge hands it over as JSON): both
   managers this season and for their careers, the all-time series
   (regular season, playoffs and consolation games apart and together,
   the streak, the last meeting, the biggest win each way, every meeting),
   and the stakes: specific, reachable things this one game can settle,
   drawn from the league's history alone, never from projections (Sleeper's
   API terms rule those out). A game already played lists what was on the
   line going in, each marked with whether it happened.

   Counted as the record book counts them: records and points for are the
   regular season's (with the median game where the league plays one);
   the playoffs are the title path's games; streaks and the single-week
   record run through every game, consolation games included, and a game
   over two weeks is kept out of one-week marks. */
(function () {
  "use strict";

  const fmt = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt1 = (n) => Number(n).toFixed(1);
  const round2 = (n) => Math.round(n * 100) / 100;
  const rec = (w, l, t) => (t ? `${w}–${l}–${t}` : `${w}–${l}`);
  const pctOf = (w, l, t) => { const g = w + l + t; return g ? (w + t / 2) / g : 0; };
  const pctText = (p) => p.toFixed(3).replace(/^0/, "");
  const ordinal = (n) => {
    const m = n % 100;
    if (m >= 11 && m <= 13) return `${n}th`;
    return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
  };
  const poss = (name) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);
  const span = (from, to) => (from === to ? String(to) : `${from}–${String(to).slice(2)}`);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

  /* ------------------------------------------------------------ history */

  /* Every game the league has played, oldest first, each side as its
     manager, and the median games beside them: built once per model. */
  const histories = new WeakMap();
  function historyOf(model) {
    if (histories.has(model)) return histories.get(model);
    const data = model.leagueData();
    const games = [], medians = [], seasons = {};
    [...data.seasons].sort((x, y) => x.year - y.year).forEach((s) => {
      const full = model.season(s.year);
      seasons[s.year] = s;
      const owner = (id) => (s.teams[id] ? s.teams[id].ownerId : null);
      const add = (g, kind) => {
        const oa = owner(g.a), ob = owner(g.b);
        if (!oa || !ob) return;
        games.push({
          year: s.year, week: g.week, kind, ta: g.a, tb: g.b, oa, ob, as: g.aScore, bs: g.bScore,
          multi: Boolean(g.multi), label: g.label || null, bracket: g.bracket || null, p: g.p || null, r: g.r || null,
        });
      };
      [...s.regularGames].sort((x, y) => x.week - y.week).forEach((g) => add(g, "regular"));
      // The season being played carries its bracket games too, once played.
      const post = s.live && full
        ? full.postseason.filter((g) => g.played && g.a && g.b).map((g) => ({
          week: g.week, a: g.a, aScore: g.aScore, b: g.b, bScore: g.bScore, label: g.label,
          bracket: g.bracket, titlePath: g.titlePath, p: g.p, r: g.r, multi: g.weeks.length > 1,
        }))
        : s.postseasonGames;
      [...post].sort((x, y) => x.week - y.week).forEach((g) => add(g, g.titlePath ? "playoffs" : "consolation"));
      if (full && full.medianResults) {
        Object.entries(full.medianResults).forEach(([w, byTeam]) => {
          Object.entries(byTeam).forEach(([id, r]) => { if (owner(id)) medians.push({ year: s.year, week: Number(w), o: owner(id), r }); });
        });
      }
    });
    const champions = {};
    data.seasons.forEach((s) => {
      if (s.live) return;
      const champ = Object.values(s.teams).find((t) => t.finalRank === 1);
      if (champ) champions[s.year] = champ.ownerId;
    });
    const h = { data, games, medians, seasons, champions };
    histories.set(model, h);
    return h;
  }

  const before = (x, year, week) => x.year < year || (x.year === year && x.week < week);

  /* Every manager as the record book tallies them, over the games that
     pass `keep`. */
  function tally(h, keep) {
    const M = {};
    const m = (o) => M[o] || (M[o] = {
      w: 0, l: 0, t: 0, games: 0, pf: 0, pw: 0, pl: 0, pt: 0, post: 0,
      run: 0, from: null, best: null, lossRun: 0, lossFrom: null, worst: null, high: null,
    });
    const league = { high: null, scores: [] };
    h.games.forEach((g) => {
      if (!keep(g)) return;
      [[g.oa, g.as, g.bs, g.ob, g.ta], [g.ob, g.bs, g.as, g.oa, g.tb]].forEach(([o, mine, theirs, opp, team]) => {
        const p = m(o);
        if (g.kind === "regular") {
          p.games += 1;
          p.pf += mine;
          if (mine > theirs) p.w += 1; else if (mine < theirs) p.l += 1; else p.t += 1;
        } else if (g.kind === "playoffs") {
          p.post += 1;
          if (mine > theirs) p.pw += 1; else if (mine < theirs) p.pl += 1; else p.pt += 1;
        }
        if (mine > theirs) {
          p.run += 1;
          if (p.run === 1) p.from = g.year;
          if (!p.best || p.run > p.best.n) p.best = { n: p.run, from: p.from, to: g.year };
        } else p.run = 0;
        if (mine < theirs) {
          p.lossRun += 1;
          if (p.lossRun === 1) p.lossFrom = g.year;
          if (!p.worst || p.lossRun > p.worst.n) p.worst = { n: p.lossRun, from: p.lossFrom, to: g.year };
        } else p.lossRun = 0;
        if (!g.multi) {
          if (!p.high || mine > p.high.pts) p.high = { pts: mine, year: g.year, week: g.week, team };
          if (!league.high || mine > league.high.pts) league.high = { pts: mine, year: g.year, week: g.week, o, team };
          league.scores.push(mine);
        }
      });
    });
    h.medians.forEach((x) => {
      if (!keep(x)) return;
      const p = m(x.o);
      if (x.r === "W") p.w += 1; else if (x.r === "L") p.l += 1; else p.t += 1;
    });
    league.scores.sort((x, y) => x - y);
    const best = (key) => Object.entries(M).reduce((top, [o, p]) => (p[key] && (!top || p[key].n > top.n) ? { ...p[key], o } : top), null);
    league.streak = best("best");
    league.skid = best("worst");
    return { M, m, league };
  }

  // The share of the league's single-week scores at or above `x`.
  function shareAtLeast(scores, x) {
    if (!scores.length) return 0;
    let lo = 0, hi = scores.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (scores[mid] < x) lo = mid + 1; else hi = mid; }
    return (scores.length - lo) / scores.length;
  }

  /* ------------------------------------------------------------ series */

  function seriesOf(h, oa, ob, keep) {
    const games = h.games.filter((g) => keep(g) && ((g.oa === oa && g.ob === ob) || (g.oa === ob && g.ob === oa)))
      .map((g) => {
        const flip = g.oa !== oa;
        return { ...g, ta: flip ? g.tb : g.ta, tb: flip ? g.ta : g.tb, as: flip ? g.bs : g.as, bs: flip ? g.as : g.bs, oa, ob };
      });
    const zero = () => ({ a: 0, b: 0, t: 0, games: 0 });
    const out = { games: games.length, all: zero(), regular: zero(), playoffs: zero(), consolation: zero(), list: games };
    let run = { side: null, n: 0 }, longest = { side: null, n: 0 };
    const pf = { a: 0, b: 0, n: 0 };
    const big = { a: null, b: null };
    games.forEach((g) => {
      const side = g.as > g.bs ? "a" : g.bs > g.as ? "b" : null;
      [out.all, out[g.kind]].forEach((r) => { r.games += 1; if (side) r[side] += 1; else r.t += 1; });
      run = side && run.side === side ? { side, n: run.n + 1 } : { side, n: side ? 1 : 0 };
      if (run.side && run.n > longest.n) longest = { ...run, to: g.year };
      if (!g.multi) {
        pf.a += g.as; pf.b += g.bs; pf.n += 1;
        if (side && (!big[side] || Math.abs(g.as - g.bs) > big[side].margin)) big[side] = { margin: Math.abs(g.as - g.bs), game: g };
      }
    });
    out.streak = run;
    out.longest = longest;
    out.avg = pf.n ? { a: pf.a / pf.n, b: pf.b / pf.n } : null;
    out.biggest = big;
    // Seasons one side won every regular-season meeting of (two or more).
    out.sweeps = { a: [], b: [] };
    const byYear = {};
    games.filter((g) => g.kind === "regular").forEach((g) => { (byYear[g.year] = byYear[g.year] || []).push(g); });
    Object.entries(byYear).forEach(([y, list]) => {
      if (list.length < 2) return;
      if (list.every((g) => g.as > g.bs)) out.sweeps.a.push(Number(y));
      if (list.every((g) => g.bs > g.as)) out.sweeps.b.push(Number(y));
    });
    return out;
  }

  /* ------------------------------------------------------------ the game */

  function locate(season, week, a, b) {
    const pair = (x, y) => (x === a && y === b) || (x === b && y === a);
    const regular = week <= season.settings.regularWeeks;
    if (regular) {
      // A two-week matchup is scored in the week it ends.
      let end = week;
      Object.entries(season.multiWeeks || {}).forEach(([e, weeks]) => { if (weeks.includes(week)) end = Number(e); });
      const scheduled = (season.schedule[week] || []).some(([x, y]) => pair(x, y));
      const row = (season.results[end] || []).find(([x, , y]) => pair(x, y));
      const score = row ? (row[0] === a ? { a: row[1], b: row[3] } : { a: row[3], b: row[1] }) : null;
      return { kind: "regular", label: `Week ${week}`, end, start: Math.min(week, ...(season.multiWeeks && season.multiWeeks[end] || [week])), scheduled, score, game: null };
    }
    const g = season.postseason.find((x) => x.weeks.includes(week) && x.a && x.b && pair(x.a, x.b)) || null;
    const score = g && g.played ? (g.a === a ? { a: g.aScore, b: g.bScore } : { a: g.bScore, b: g.aScore }) : null;
    return {
      kind: g ? (g.titlePath ? "playoffs" : "consolation") : "playoffs",
      label: g ? g.label : `Week ${week}`, end: g ? g.week : week, start: g ? g.weeks[0] : week,
      scheduled: Boolean(g), score, game: g,
    };
  }

  // Both teams' records going into the week (regular season so far).
  function seasonRecord(season, id, upTo) {
    let w = 0, l = 0, t = 0, pf = 0;
    Object.keys(season.results).map(Number).filter((wk) => wk < upTo).forEach((wk) => {
      season.results[wk].forEach(([x, xs, y, ys]) => {
        if (x !== id && y !== id) return;
        const mine = x === id ? xs : ys, theirs = x === id ? ys : xs;
        pf += mine;
        if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
      });
      const med = season.medianResults && season.medianResults[wk] && season.medianResults[wk][id];
      if (med === "W") w++; else if (med === "L") l++; else if (med === "T") t++;
    });
    return { w, l, t, pf };
  }

  /* ------------------------------------------------------------ stakes */

  function stakesFor(ctx) {
    const { h, loc, side, opp, name, oppName, owners, before: T, series, season, a, b, median } = ctx;
    const items = [];
    const add = (rank, kind, text, cond, extra = {}) => items.push({ side: side.key, rank, kind, text, cond, ...extra });
    const me = T.M[side.owner] || T.m(side.owner), them = T.M[opp.owner] || T.m(opp.owner);
    const L = T.league;
    const isRegular = loc.kind === "regular";
    // The series, always from this side's seat: "a" is this side.
    const s = series;
    const mine = "a", theirs = "b";
    const ownerName = (o) => (owners[o] ? owners[o].name : "a manager");

    /* --- the title game */
    if (loc.game && loc.game.bracket === "W" && loc.game.p === 1 && loc.game.titlePath) {
      const titles = Object.entries(h.champions).filter(([y, o]) => Number(y) < ctx.year && o === side.owner).map(([y]) => Number(y));
      const lastYear = h.champions[ctx.year - 1] === side.owner;
      add(100, "title", titles.length
        ? `A win gives ${name} a ${ordinal(titles.length + 1)} title${lastYear ? ", back to back" : ""}`
        : `A win gives ${name} a first title`, { when: "win" }, { tone: "gold" });
    }

    /* --- playoff firsts */
    if (loc.kind === "playoffs") {
      if (me.post === 0) add(62, "playoffs", `${poss(name)} first playoff game`, { when: "always" }, { tone: "gold" });
      else if (me.pw === 0) add(78, "playoffs", `A win would be ${poss(name)} first playoff win (0–${me.pl + me.pt} so far)`, { when: "win" }, { tone: "gold" });
      else if ([5, 10, 15, 20].includes(me.pw + 1)) add(44, "playoffs", `A win would be ${poss(name)} ${ordinal(me.pw + 1)} playoff win`, { when: "win" }, { tone: "gold" });
    }

    /* --- the series */
    const won = s.all[mine], lost = s.all[theirs], ties = s.all.t;
    // Said once, for both sides.
    if (side.key === "a") {
      const both = (rank, kind, text, cond, extra) => items.push({ side: null, rank, kind, text, cond, ...extra });
      if (!s.games) both(55, "first-meeting", `The first meeting between these two managers`, { when: "always" }, { tone: "navy" });
      else if (won === lost) both(s.games >= 4 ? 50 : 30, "series-lead", `The all-time series is tied ${rec(won, lost, ties)}: the winner takes the lead`, { when: "decided" }, { tone: "blue" });
      // A playoff meeting this season or last, met again.
      const rematch = s.list.filter((g) => g.kind === "playoffs").pop();
      if (rematch && (loc.kind === "playoffs" || rematch.year >= ctx.year - 1)) {
        const who = rematch.as > rematch.bs ? name : rematch.bs > rematch.as ? oppName : null;
        both(loc.kind === "playoffs" ? 46 : 36, "rematch", `A${loc.kind === "playoffs" ? " playoff" : ""} rematch of the ${rematch.year} ${rematch.label}${who ? `, won by ${who}` : ""}`, { when: "always" }, { tone: "gold" });
      }
    }
    if (s.games >= 2 && won === 0) {
      add(60 + Math.min(s.games, 8) * 3, "first-win", `A win would be ${poss(name)} first ever over ${oppName} (${rec(0, lost, ties)})`, { when: "win" }, { tone: "red" });
    } else if (s.streak.side === theirs && s.streak.n >= 2) {
      add(Math.min(80, 38 + 5 * s.streak.n), "series-streak", `A win would snap a ${s.streak.n}-game losing streak to ${oppName}`, { when: "win" }, { tone: "blue" });
    }
    if (s.streak.side === mine && s.streak.n >= 2) {
      const n = s.streak.n + 1;
      if (n > s.longest.n && s.games >= 5) add(45 + 4 * s.streak.n, "series-streak", `A win makes it ${n} straight over ${oppName}, the longest run in the series`, { when: "win" }, { tone: "blue" });
      else if (s.streak.n >= 3) add(25 + 3 * s.streak.n, "series-streak", `A win makes it ${n} straight over ${oppName}`, { when: "win" }, { tone: "blue" });
    }
    if (s.games > 0 && won + 1 === lost) {
      add(48, "series-lead", `A win evens the all-time series at ${rec(lost, lost, ties)}`, { when: "win" }, { tone: "blue" });
    }
    if (s.games >= 4 && won + 1 >= 10 && (won + 1) % 5 === 0) {
      add(30, "series-wins", `A win would be ${poss(name)} ${ordinal(won + 1)} over ${oppName}`, { when: "win" }, { tone: "blue" });
    }
    // The season series: this the last meeting, the others all won.
    if (isRegular) {
      const meetingWeeks = Object.keys(season.schedule).map(Number).filter((w) => {
        let end = w;
        Object.entries(season.multiWeeks || {}).forEach(([e, weeks]) => { if (weeks.includes(w)) end = Number(e); });
        return end === w && w <= season.settings.regularWeeks &&
          season.schedule[w].some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      });
      const prior = s.list.filter((g) => g.year === ctx.year && g.kind === "regular");
      const last = meetingWeeks.length && Math.max(...meetingWeeks) === loc.end;
      if (last && prior.length >= 1) {
        const iWon = prior.every((g) => g.as > g.bs);
        const theyWon = prior.every((g) => g.bs > g.as);
        if (iWon) {
          const first = !s.sweeps[mine].length;
          add(first ? 70 : 56, "sweep", `A win gives ${name} ${first ? "a first" : "a"} season sweep of ${oppName}${first ? "" : ` (${s.sweeps[mine].length === 1 ? "also" : "after"} ${s.sweeps[mine].join(", ")})`}`, { when: "win" }, { tone: "purple" });
        } else if (theyWon) {
          add(26, "sweep", `A win splits the season series and keeps ${oppName} from a sweep`, { when: "win" }, { tone: "purple" });
        }
      }
    }

    /* --- streaks across the league */
    const r = me.run;
    const top = L.streak;
    let streakItem = null;
    if (top && top.n >= 4 && r + 1 > top.n) {
      streakItem = top.o === side.owner && r === top.n
        ? [88, `A win extends ${poss(name)} league-record win streak to ${r + 1}`]
        : [90, `A win gives ${name} the league’s longest win streak ever (${r + 1})`];
    } else if (top && top.n >= 4 && r + 1 === top.n) {
      streakItem = [80, `Win and ${name} ties the league’s longest win streak (${top.n}, ${ownerName(top.o)}, ${span(top.from, top.to)})`];
    } else if (r >= 2 && me.best && me.best.n >= 3 && r + 1 > me.best.n) {
      streakItem = [60, `A win would be ${poss(name)} longest win streak ever (${r + 1})`];
    } else if (r >= 2 && me.best && r + 1 === me.best.n) {
      streakItem = [52, `A win matches ${poss(name)} longest win streak (${me.best.n}, ${span(me.best.from, me.best.to)})`];
    } else if (r >= 3) {
      streakItem = [22 + 3 * r, `${name} has won ${r} straight; a win makes it ${r + 1}`];
    }
    if (streakItem) add(streakItem[0], "win-streak", streakItem[1], { when: "win" }, { tone: "fire" });

    const l = me.lossRun;
    const skid = L.skid;
    let skidItem = null;
    if (skid && skid.n >= 4 && l + 1 > skid.n) {
      skidItem = [72, `Lose and ${name} sets the league’s longest losing streak (${l + 1})`, "lose"];
    } else if (skid && skid.n >= 4 && l + 1 === skid.n) {
      skidItem = [66, `Lose and ${name} ties the league’s longest losing streak (${skid.n}, ${ownerName(skid.o)}, ${span(skid.from, skid.to)})`, "lose"];
    } else if (l >= 2 && me.worst && me.worst.n >= 3 && l + 1 > me.worst.n) {
      skidItem = [50, `Lose and it’s ${poss(name)} longest losing streak ever (${l + 1})`, "lose"];
    } else if (l >= 2 && me.worst && l + 1 === me.worst.n) {
      skidItem = [45, `Lose and it matches ${poss(name)} longest losing streak (${me.worst.n}, ${span(me.worst.from, me.worst.to)})`, "lose"];
    } else if (l >= 3) {
      skidItem = [Math.min(70, 30 + 5 * l), `A win would snap ${poss(name)} ${l}-game losing streak`, "win"];
    }
    if (skidItem) add(skidItem[0], "loss-streak", skidItem[1], { when: skidItem[2] }, { tone: "red" });

    /* --- career marks (the regular season's, as the record book keeps) */
    if (isRegular) {
      const next = me.w + 1;
      if (next === 10 || next % 25 === 0) {
        add(next === 10 ? 34 : 45 + (next % 100 === 0 ? 20 : next % 50 === 0 ? 10 : 0), "wins",
          median ? `${name} is one win from ${next} regular-season wins` : `A win would be ${poss(name)} ${ordinal(next)} regular-season win`,
          { when: "win" }, { tone: "gold" });
      }
      const g = me.w + me.l + me.t;
      if (g >= 10 && !median) {
        const now = pctOf(me.w, me.l, me.t), up = pctOf(me.w + 1, me.l, me.t), down = pctOf(me.w, me.l + 1, me.t);
        if (now < 0.5 && up >= 0.5) add(42, "500", up === 0.5 ? `A win gets ${name} back to .500 all-time (${rec(me.w, me.l, me.t)} now)` : `A win lifts ${name} over .500 all-time (${rec(me.w, me.l, me.t)} now)`, { when: "win" }, { tone: "blue" });
        else if (now >= 0.5 && down < 0.5) add(40, "500", `A loss drops ${name} under .500 all-time (${rec(me.w, me.l, me.t)} now)`, { when: "lose" }, { tone: "red" });
      }
      if (me.games > 0 && (me.games + 1) % 50 === 0) {
        add(18, "games", `${poss(name)} ${ordinal(me.games + 1)} regular-season game`, { when: "always" }, { tone: "navy" });
      }
      // All-time points for, the next thousand.
      const mark = Math.ceil((me.pf + 0.005) / 1000) * 1000;
      const need = Math.round((mark - me.pf) * 100) / 100;
      if (me.games >= 4 && shareAtLeast(L.scores, need) >= 0.25) {
        add(28 + (mark % 10000 === 0 ? 18 : mark % 5000 === 0 ? 10 : 0), "points",
          `${fmt(need)} points takes ${name} past ${mark.toLocaleString("en-US")} all-time points`, { when: "score", score: need }, { tone: "navy" });
      }
    }

    /* --- one-week highs */
    if (me.high && (me.games + me.post) >= 8) {
      const need = Math.round((me.high.pts + 0.01) * 100) / 100;
      const share = shareAtLeast(L.scores, need);
      if (share >= 0.05) {
        let text = `${fmt(need)} points sets ${poss(name)} career high (${fmt(me.high.pts)}, ${me.high.year})`;
        if (L.high && L.high.o === side.owner && L.high.pts === me.high.pts) text = `${fmt(need)} points breaks the league single-week record, ${poss(name)} own ${fmt(L.high.pts)} (${L.high.year})`;
        else if (L.high) text += `; ${fmt(L.high.pts + 0.01)} breaks the league record`;
        add(Math.round(32 + 18 * share), "high", text, { when: "score", score: need }, { tone: "fire" });
      }
    }
    return items;
  }

  // Each kind of stake as the record book marks its highlights.
  const STAKE_ICONS = {
    title: "🏆", playoffs: "🏅", rematch: "🔁", "first-meeting": "🤝", "first-win": "🎯",
    "series-streak": "⚔️", "series-lead": "⚖️", "series-wins": "⚔️", sweep: "🧹",
    "win-streak": "📈", "loss-streak": "🧊", wins: "⭐", 500: "⚖️", games: "📅", points: "💯", high: "🔥",
  };

  // The most interesting first, at most `cap`, with each side heard.
  function pick(items, cap) {
    const sorted = [...items].sort((x, y) => y.rank - x.rank);
    const out = sorted.slice(0, cap);
    ["a", "b"].forEach((side) => {
      if (out.some((x) => x.side === side)) return;
      const best = sorted.find((x) => x.side === side);
      if (!best) return;
      if (out.length < cap) { out.push(best); return; }
      // In place of the lowest item of the side that has the most.
      const other = side === "a" ? "b" : "a";
      const idx = out.map((x) => x.side).lastIndexOf(other);
      if (idx >= 0) out[idx] = best;
    });
    return out.sort((x, y) => y.rank - x.rank);
  }

  /* ------------------------------------------------------------ answer */

  function rivalry(model, year, week, a, b, opts = {}) {
    year = Number(year); week = Number(week);
    const season = model.season(year);
    if (!season) throw new Error(`There is no ${year} season.`);
    if (!season.teams[a] || !season.teams[b]) throw new Error("Those teams aren't in this season.");
    const h = historyOf(model);
    const loc = locate(season, week, a, b);
    const median = Boolean(season.settings.median);
    const owners = model.owners;
    const oa = season.teams[a].ownerId, ob = season.teams[b].ownerId;
    const keepBefore = (x) => before(x, year, loc.start);
    const keepAll = () => true;
    const T0 = tally(h, keepBefore);
    const Tnow = tally(h, keepAll);
    const was = seriesOf(h, oa, ob, keepBefore);
    const now = seriesOf(h, oa, ob, keepAll);
    const played = Boolean(loc.score);

    const teamName = (y, id) => (h.seasons[y] && h.seasons[y].teams[id] ? h.seasons[y].teams[id].name : (season.teams[id] || {}).name || id);
    const side = (key, id, owner) => {
      const t = season.teams[id];
      const sr = seasonRecord(season, id, loc.kind === "regular" ? loc.start : season.settings.regularWeeks + 1);
      const p = Tnow.M[owner] || Tnow.m(owner);
      const titles = Object.entries(h.champions).filter(([, o]) => o === owner).map(([y]) => Number(y));
      const seasonsPlayed = Object.values(h.seasons).filter((s) => Object.values(s.teams).some((x) => x.ownerId === owner)).length;
      return {
        key, teamId: id, ownerId: owner, team: t.name, owner: (owners[owner] || {}).name || t.owner,
        icon: t.icon || "", color: t.color || null,
        season: {
          record: (opts.records && opts.records[id]) || rec(sr.w, sr.l, sr.t),
          wins: sr.w, losses: sr.l, ties: sr.t, pf: round2(sr.pf), pfText: fmt(sr.pf),
          games: sr.w + sr.l + sr.t,
        },
        career: {
          seasons: seasonsPlayed,
          record: rec(p.w, p.l, p.t), pct: pctText(pctOf(p.w, p.l, p.t)),
          playoffs: rec(p.pw, p.pl, p.pt), titles: titles.length, titleYears: titles,
          pfg: p.games ? fmt1(p.pf / p.games) : "—",
          high: p.high ? { pts: p.high.pts, text: fmt(p.high.pts), year: p.high.year, week: p.high.week } : null,
          streak: p.best ? { n: p.best.n, text: `${p.best.n} straight`, years: span(p.best.from, p.best.to) } : null,
        },
      };
    };
    const A = side("a", a, oa), B = side("b", b, ob);

    // The series as it stands now (with this game, once it's played).
    const S = now;
    const meeting = (g) => ({
      year: g.year, week: g.week, kind: g.kind,
      label: g.kind === "regular" ? `Week ${g.week}` : g.label,
      teamA: teamName(g.year, g.ta), teamB: teamName(g.year, g.tb),
      // that season's team ids, for the game's box score and badges
      teamIdA: g.ta, teamIdB: g.tb,
      aScore: g.as, bScore: g.bs, aText: fmt(g.as), bText: fmt(g.bs),
      winner: g.as > g.bs ? "a" : g.bs > g.as ? "b" : null,
      multi: g.multi,
      current: g.year === year && g.week === loc.end && (g.ta === a || g.tb === a),
    });
    const leadText = !S.games ? `First meeting`
      : S.all.a === S.all.b ? `Series tied ${rec(S.all.a, S.all.b, S.all.t)}`
      : S.all.a > S.all.b ? `${A.team} leads ${rec(S.all.a, S.all.b, S.all.t)}`
      : `${B.team} leads ${rec(S.all.b, S.all.a, S.all.t)}`;
    const streakText = S.streak.side
      ? `${S.streak.side === "a" ? A.team : B.team} ${S.streak.n === 1 ? "won the last meeting" : `has won ${S.streak.n} straight`}`
      : S.games ? "The last meeting was a tie" : "";
    const big = (k) => {
      const x = S.biggest[k];
      return x ? { margin: round2(x.margin), marginText: fmt(x.margin), ...meeting(x.game) } : null;
    };
    const split = (r) => ({ a: r.a, b: r.b, t: r.t, games: r.games, record: rec(r.a, r.b, r.t) });
    const series = {
      games: S.games,
      lead: leadText,
      all: split(S.all), regular: split(S.regular), playoffs: split(S.playoffs), consolation: split(S.consolation),
      streak: { side: S.streak.side, n: S.streak.n, text: streakText },
      last: S.list.length ? meeting(S.list[S.list.length - 1]) : null,
      biggest: { a: big("a"), b: big("b") },
      avg: S.avg ? { a: round2(S.avg.a), b: round2(S.avg.b), aText: fmt(S.avg.a), bText: fmt(S.avg.b) } : null,
      sweeps: { a: S.sweeps.a, b: S.sweeps.b },
      playoffMeetings: S.list.filter((g) => g.kind === "playoffs").map(meeting).reverse(),
      meetings: S.list.map(meeting).reverse(),
    };

    // The stakes, as they stood going in.
    const ctx = { h, loc, year, season, a, b, owners, before: T0, series: was, median };
    const items = [
      ...stakesFor({ ...ctx, side: { key: "a", owner: oa }, opp: { owner: ob }, name: A.team, oppName: B.team }),
      ...stakesFor({ ...ctx, side: { key: "b", owner: ob }, opp: { owner: oa }, name: B.team, oppName: A.team, series: flipSeries(was) }),
    ];
    // Two first titles on the line are one line.
    const firsts = items.filter((x) => x.kind === "title" && / a first title$/.test(x.text));
    if (firsts.length === 2) {
      items.splice(items.indexOf(firsts[1]), 1);
      Object.assign(firsts[0], { side: null, text: "The winner takes a first title", cond: { when: "decided" } });
    }
    const stakes = pick(items, 6).map((x) => {
      const out = { side: x.side, kind: x.kind, tone: x.tone || "navy", icon: STAKE_ICONS[x.kind] || "•", text: x.text, when: x.cond.when, score: x.cond.score == null ? null : x.cond.score, rank: x.rank, hit: null };
      if (played) {
        const mine = x.side === "b" ? loc.score.b : loc.score.a, theirs = x.side === "b" ? loc.score.a : loc.score.b;
        out.hit = x.cond.when === "win" ? mine > theirs
          : x.cond.when === "lose" ? mine < theirs
          : x.cond.when === "decided" ? mine !== theirs
          : x.cond.when === "score" ? mine >= x.cond.score
          : true;
      }
      return out;
    });

    return {
      year, week, end: loc.end, kind: loc.kind, label: loc.label, scheduled: loc.scheduled,
      played, score: loc.score ? { a: loc.score.a, b: loc.score.b, aText: fmt(loc.score.a), bText: fmt(loc.score.b) } : null,
      a: A, b: B,
      met: S.games > 0,
      metBefore: was.games > 0,
      series,
      stakesTitle: played ? "What was on the line" : "Records within reach",
      stakes,
      noStakes: played ? "Nothing in the record book was on the line in this one." : "Nothing in the record book is within reach in this one.",
      note: "From the league’s own history, never projections. Records and points count the regular season, as in the record book.",
    };
  }

  // The series seen from b's side.
  function flipSeries(s) {
    const f = (r) => ({ a: r.b, b: r.a, t: r.t, games: r.games });
    return {
      ...s,
      all: f(s.all), regular: f(s.regular), playoffs: f(s.playoffs), consolation: f(s.consolation),
      streak: { ...s.streak, side: s.streak.side === "a" ? "b" : s.streak.side === "b" ? "a" : null },
      longest: { ...s.longest, side: s.longest.side === "a" ? "b" : s.longest.side === "b" ? "a" : null },
      sweeps: { a: s.sweeps.b, b: s.sweeps.a },
      list: s.list.map((g) => ({ ...g, as: g.bs, bs: g.as, ta: g.tb, tb: g.ta, oa: g.ob, ob: g.oa })),
    };
  }

  window.Insights = Object.assign(window.Insights || {}, { rivalry });
})();


/* ---------------------------------------------------------------------
   The SLUH22 side: the model Insights.rivalry reads, and the preview as a
   season page draws it in its box score sheet (as Pigskin Pantheon's
   season page does).

   A season page loads league-data.js and this file before its own script,
   and its script provides what the preview hooks into: the box score
   sheet and its trail (bxModal, bxTicket, bxNow, bxTrail, bxTop, bxGo,
   bxShown, samePair, boxWeeks), the page's teams and badges (teams,
   miniTeam, teamMark, CARD_ICONS) and BOX_SEASON. The season being played
   (2026) is the page's own data (teams, schedule, results,
   playoffGamesOfWeek); every finished one comes from league-data.js.
   --------------------------------------------------------------------- */

const rvEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* league-data.js names postseason games by round only; the rivalry reads
   which games were on the title path, and the final. */
function rvPostGame(g) {
  const title = /^(Quarterfinal|Semifinal|Championship)$/.test(g.label || "");
  return { ...g, bracket: title ? "W" : "L", titlePath: title, p: g.label === "Championship" ? 1 : null };
}

let rvModelCache = null;
function rivalryModel() {
  if (rvModelCache) return rvModelCache;
  const data = typeof LEAGUE_DATA !== "undefined" ? LEAGUE_DATA : { owners: {}, seasons: [] };
  const live = BOX_SEASON;
  const finished = data.seasons.map((s) => ({
    year: s.year, teams: s.teams, regularGames: s.regularGames,
    postseasonGames: [
      ...s.postseasonGames.map(rvPostGame),
      ...(data.thirdPlaceGames || []).filter((g) => g.year === s.year).map((g) => ({
        week: g.week, a: g.winner, aScore: g.winScore, b: g.loser, bScore: g.loseScore,
        label: "Third-place game", bracket: "W", titlePath: false, p: 3,
      })),
    ],
  }));
  const seasons = {};
  finished.forEach((s) => {
    const schedule = {}, results = {};
    let regularWeeks = 0;
    s.regularGames.forEach((g) => {
      (schedule[g.week] = schedule[g.week] || []).push([g.a, g.b]);
      (results[g.week] = results[g.week] || []).push([g.a, g.aScore, g.b, g.bScore]);
      regularWeeks = Math.max(regularWeeks, g.week);
    });
    seasons[s.year] = {
      year: s.year, teams: s.teams, settings: { regularWeeks, median: false }, schedule, results, multiWeeks: {}, medianResults: {},
      postseason: s.postseasonGames.map((g) => ({ ...g, weeks: [g.week], played: true })),
    };
  });
  // The season being played, on its own page: from the page's data, as it stands.
  let current = null;
  if (!seasons[live] && typeof results !== "undefined" && typeof schedule !== "undefined") {
    const postseason = [];
    if (typeof playoffGamesOfWeek === "function") {
      [15, 16, 17].forEach((w) => playoffGamesOfWeek(w).forEach((g) => postseason.push({
        weeks: [w], week: w, a: g.a, b: g.b, aScore: g.as, bScore: g.bs, played: true, label: g.label,
        bracket: g.consolation ? "L" : "W", titlePath: !g.consolation && g.label !== "Third-place game",
        p: g.final ? 1 : g.label === "Third-place game" ? 3 : null,
      })));
    }
    current = seasons[live] = {
      year: live, teams, settings: { regularWeeks: typeof REGULAR_WEEKS !== "undefined" ? REGULAR_WEEKS : 14, median: false },
      schedule, results, multiWeeks: {}, medianResults: {}, postseason,
    };
  }
  const boxIndex = {}, boxGames = {};
  rvModelCache = {
    owners: data.owners,
    season: (year) => seasons[year] || null,
    leagueData: () => ({
      owners: data.owners,
      seasons: [
        ...finished,
        ...(current ? [{
          year: live, live: true, teams,
          regularGames: Object.entries(results).flatMap(([w, games]) => games.map(([a, as, b, bs]) => ({ week: Number(w), a, aScore: as, b, bScore: bs }))),
          postseasonGames: [],
        }] : []),
      ],
    }),
    // Another season's box scores, filed as the page's own are.
    boxWeeks: (year) => (boxIndex[year] = boxIndex[year] || fetch(`boxscores/${year}/index.json`)
      .then((res) => (res.ok ? res.json() : [])).then((list) => new Set(list)).catch(() => new Set())),
    boxWeek: (year, week) => (boxGames[`${year}:${week}`] = boxGames[`${year}:${week}`] || fetch(`boxscores/${year}/week-${week}.json`)
      .then((res) => (res.ok ? res.json() : null)).catch(() => null)),
  };
  return rvModelCache;
}

let rvOpener = null;

// The visible way in, under each matchup tile.
function rivalryButton(week, a, b) {
  return `<button type="button" class="rv-open" data-rv-week="${week}" data-rv-a="${a}" data-rv-b="${b}"
    aria-label="Rivalry preview: ${rvEsc(teams[a].name)} versus ${rvEsc(teams[b].name)}">
    <svg viewBox="0 0 16 16" aria-hidden="true">${CARD_ICONS.versus}</svg>
    <span>Rivalry &amp; stakes</span><i aria-hidden="true">›</i>
  </button>`;
}

function rivalryHTML(r) {
  const A = r.a, B = r.b, S = r.series;
  const sideOf = (k) => (k === "a" ? A : k === "b" ? B : null);
  const team = (s) => `
    <div class="rv-team rv-${s.key}">
      ${miniTeam(s.teamId)}
      <div class="rv-team-text">
        <strong>${rvEsc(s.team)}</strong>
        <span>${rvEsc(s.owner)}</span>
        <em>${rvEsc(s.season.record)}${s.season.games ? ` · ${s.season.pfText} PF` : ""}</em>
      </div>
    </div>`;
  const centre = r.played
    ? `<small>Final</small>
       <div class="rv-final"><span class="${r.score.a > r.score.b ? "rv-won" : ""}">${r.score.aText}</span> – <span class="${r.score.b > r.score.a ? "rv-won" : ""}">${r.score.bText}</span></div>
       <span>${rvEsc(S.games ? `All-time ${S.all.record}` : "First meeting")}</span>`
    : S.games
      ? `<small>All-time</small><b>${rvEsc(S.all.record)}</b><span>${rvEsc(S.streak.text)}</span>`
      : `<small>All-time</small><b>0–0</b><span>First meeting</span>`;

  const stakes = r.stakes.length
    ? `<ol class="rv-stakes">${r.stakes.map((x, i) => {
        const s = sideOf(x.side);
        // Whose line it is, by logo; a played game's adds whether it happened.
        const badge = s ? miniTeam(s.teamId) : "";
        const tag = x.hit == null ? badge
          : `<span class="rv-stake-end">${badge}<span class="rv-tag ${x.hit ? "rv-hit" : "rv-miss"}">${x.hit ? "Happened" : "Didn’t"}</span></span>`;
        return `<li class="rv-stake rv-tone-${x.tone}" style="--rv-i:${i}">
          <span class="rv-ico" aria-hidden="true">${x.icon}</span>
          <p>${rvEsc(x.text)}</p>
          ${tag}
        </li>`;
      }).join("")}</ol>`
    : `<p class="rv-empty">${rvEsc(r.noStakes)}</p>`;

  const tile = (label, value, meta) => ({ label, value, meta });
  const meetLine = (m) => `${m.year} ${m.kind === "regular" ? `week ${m.week}` : rvEsc(m.label)}`;
  const leadOf = (rec) => (rec.a > rec.b ? A.team : rec.b > rec.a ? B.team : null);
  const split = (rec) => (rec.games ? `${rvEsc(rec.record)}` : "—");
  const splitMeta = (rec) => (!rec.games ? "No meetings" : leadOf(rec) ? `${rvEsc(leadOf(rec))} ahead` : "Even");
  const big = (k) => {
    const m = S.biggest[k];
    return m ? tile(`${rvEsc(sideOf(k).team)}’s biggest win`, `+${m.marginText}`, `${k === "a" ? `${m.aText}–${m.bText}` : `${m.bText}–${m.aText}`} · ${meetLine(m)}`)
      : tile(`${rvEsc(sideOf(k).team)}’s biggest win`, "—", "Hasn’t won one yet");
  };
  const sweeps = (k) => (S.sweeps[k].length ? `${rvEsc(sideOf(k).team)} ${S.sweeps[k].join(", ")}` : "");
  const sweepText = [sweeps("a"), sweeps("b")].filter(Boolean).join(" · ");
  const tiles = !S.games ? [] : [
    tile("Regular season", split(S.regular), splitMeta(S.regular)),
    tile("Playoffs", split(S.playoffs), S.playoffs.games ? splitMeta(S.playoffs) : "Never met"),
    S.consolation.games ? tile("Consolation", split(S.consolation), splitMeta(S.consolation)) : null,
    S.all.t ? tile("Ties", String(S.all.t), "") : null,
    S.last ? tile("Last meeting", `${S.last.aText}–${S.last.bText}`, `${meetLine(S.last)} · ${S.last.winner ? `${rvEsc(sideOf(S.last.winner).team)} won` : "a tie"}`) : null,
    S.avg ? tile("Average score", `${S.avg.aText}–${S.avg.bText}`, "per meeting") : null,
    big("a"),
    big("b"),
    sweepText ? tile("Season sweeps", sweepText, "") : null,
  ].filter(Boolean);
  // An odd tile out runs the width of the card.
  const series = S.games ? `
    <div class="rv-tiles">${tiles.map((t, i) => `<div class="rv-tile${i === tiles.length - 1 && tiles.length % 2 ? " rv-wide" : ""}"><small>${t.label}</small><strong>${t.value}</strong>${t.meta ? `<span>${t.meta}</span>` : ""}</div>`).join("")}</div>`
    : `<p class="rv-empty">These two managers have never met. Here is how each has fared against the league.</p>`;

  // Tale of the tape: the careers side by side, the better one in blue.
  const tape = (label, x, y, better) => {
    const cmp = better ? better() : 0;
    return `<div class="rv-tape-row"><b class="${cmp > 0 ? "rv-better" : ""}">${x}</b><small>${label}</small><b class="${cmp < 0 ? "rv-better" : ""}">${y}</b></div>`;
  };
  const ca = A.career, cb = B.career;
  const num = (v) => parseFloat(String(v).replace(/,/g, "")) || 0;
  const tapeRows = `
    <div class="rv-tape">
      <div class="rv-tape-row rv-tape-head"><b>${rvEsc(A.team)}</b><small></small><b>${rvEsc(B.team)}</b></div>
      ${tape("Record", rvEsc(ca.record), rvEsc(cb.record), () => num(ca.pct) - num(cb.pct))}
      ${tape("Win pct", ca.pct, cb.pct, () => num(ca.pct) - num(cb.pct))}
      ${tape("Playoffs", rvEsc(ca.playoffs), rvEsc(cb.playoffs))}
      ${tape("Titles", String(ca.titles), String(cb.titles), () => ca.titles - cb.titles)}
      ${tape("Points / game", ca.pfg, cb.pfg, () => num(ca.pfg) - num(cb.pfg))}
      ${tape("Best week", ca.high ? ca.high.text : "—", cb.high ? cb.high.text : "—", () => (ca.high ? ca.high.pts : 0) - (cb.high ? cb.high.pts : 0))}
      ${tape("Win streak", ca.streak ? String(ca.streak.n) : "—", cb.streak ? String(cb.streak.n) : "—", () => (ca.streak ? ca.streak.n : 0) - (cb.streak ? cb.streak.n : 0))}
      ${tape("Seasons", String(ca.seasons), String(cb.seasons))}
    </div>`;

  /* Every meeting, newest first, a season to a group: the week (or a
     playoff or consolation game's round as a chip) over the two teams,
     the winner's name and score in ink, as in the app. Each opens its
     box score (openBox, that season's ids); openRivalry greys out the
     ones without one. */
  const yrTeam = (year, id) => { const s = rivalryModel().season(year); return s && s.teams[id] ? s.teams[id] : null; };
  const yrBadge = (t) => (t ? `<span class="mini-badge" style="--team-color:${t.color || "#304f91"}">${teamMark(t)}</span>` : '<span class="mini-badge"></span>');
  const meetRow = (m) => {
    const side = (k) => `<span class="rv-mt-side${m.winner === k ? " rv-mt-win" : ""}">
        ${yrBadge(yrTeam(m.year, k === "a" ? m.teamIdA : m.teamIdB))}<span class="rv-mt-name">${rvEsc(k === "a" ? m.teamA : m.teamB)}</span><b>${k === "a" ? m.aText : m.bText}</b>
      </span>`;
    const round = m.kind === "regular" ? `Week ${m.week}` : m.label;
    const when = m.kind === "regular" ? `<span class="rv-mt-when">${round}</span>`
      : `<span class="rv-mt-when rv-mt-${m.kind === "playoffs" ? "po" : "con"}">${rvEsc(round)}</span>`;
    // Read winner first, as the app does.
    const [first, second] = m.winner === "b" ? [[m.teamB, m.bText], [m.teamA, m.aText]] : [[m.teamA, m.aText], [m.teamB, m.bText]];
    const said = `${m.year} ${round}: ${first[0]} ${first[1]}, ${second[0]} ${second[1]}${m.winner ? "" : ", a tie"}${m.current ? ". This game" : ""}. Box score`;
    return `<button type="button" class="rv-mt${m.current ? " rv-now" : ""}" data-rv-box="${m.year}" data-week="${m.week}" data-a="${m.teamIdA}" data-b="${m.teamIdB}" aria-label="${rvEsc(said)}">
        <span class="rv-mt-meta">${when}${m.winner ? "" : '<span class="rv-mt-tie">Tie</span>'}</span>
        <span class="rv-mt-teams">${side("a")}${side("b")}</span>
        <i class="rv-mt-go" aria-hidden="true">›</i>
      </button>`;
  };
  const groups = [];
  S.meetings.forEach((m) => {
    let g = groups[groups.length - 1];
    if (!g || g.year !== m.year) groups.push(g = { year: m.year, list: [] });
    g.list.push(m);
  });
  const groupHtml = (g) => {
    const w = g.list.filter((m) => m.winner === "a").length, l = g.list.filter((m) => m.winner === "b").length;
    const t = g.list.length - w - l;
    return `<div class="rv-yr">
        <div class="rv-yr-head"><span>${g.year}</span><span>${rvEsc(A.team)} ${w}–${l}${t ? `–${t}` : ""}</span></div>
        ${g.list.map(meetRow).join("")}
      </div>`;
  };
  // About six games up front, whole seasons at a time; the rest folded.
  const SHOWN = 6;
  let shown = 0, cut = groups.length;
  for (let i = 0; i < groups.length; i++) {
    if (i > 0 && shown >= SHOWN) { cut = i; break; }
    shown += groups[i].list.length;
  }
  const later = groups.slice(cut).reduce((n, g) => n + g.list.length, 0);
  const meetings = S.meetings.length ? `
    <section class="rv-card rv-card-meet" aria-label="Every meeting">
      <h4>Every meeting <span>${S.meetings.length} game${S.meetings.length === 1 ? "" : "s"}</span></h4>
      ${groups.slice(0, cut).map(groupHtml).join("")}
      ${later ? `<details class="rv-more"><summary>Show ${later} more</summary>${groups.slice(cut).map(groupHtml).join("")}</details>` : ""}
    </section>` : "";

  return `<div class="rv-body">
    <div class="rv-hero">${team(A)}<div class="rv-center">${centre}</div>${team(B)}</div>
    <div class="rv-grid">
      <div class="rv-col">
        <section class="rv-card rv-card-stakes" aria-label="${rvEsc(r.stakesTitle)}">
          <h4>${rvEsc(r.stakesTitle)}<span>${r.played ? "Going in" : "This game"}</span></h4>
          ${stakes}
        </section>
        <section class="rv-card rv-card-tape" aria-label="Tale of the tape">
          <h4>Tale of the tape<span>All-time</span></h4>
          ${tapeRows}
        </section>
      </div>
      <div class="rv-col">
        <section class="rv-card" aria-label="The series">
          <h4>The series<span>${rvEsc(S.games ? S.lead : "Never met")}</span></h4>
          ${series}
        </section>
      </div>
    </div>
    ${meetings}
  </div>`;
}


// `view`: { kind: "rv", week, a, b }, drawn in the box score's sheet
// (its trail and back button are the box score's: bxGo, bxShown).
function openRivalry(view, trail = [], back = false) {
  if (!bxModal || !window.Insights || !Insights.rivalry) return;
  const { week, a, b } = view;
  const SEASON = BOX_SEASON;
  let r;
  try { r = Insights.rivalry(rivalryModel(), SEASON, week, a, b); } catch (err) { console.warn(err); return; }
  bxTicket++;
  bxNow = view;
  bxTrail = trail;
  view.end = r.end;   // the game's last week, which its box score is filed under
  if (!bxModal.classList.contains("open")) rvOpener = document.activeElement;
  bxModal.classList.add("rv-mode");
  document.getElementById("bxTitle").textContent = `${SEASON} · ${r.kind === "regular" ? `Week ${week}` : r.label}`;
  document.getElementById("bxSub").textContent = r.played ? `Rivalry · ${r.kind === "regular" ? "Final" : r.label}` : "Rivalry preview";
  const cols = document.getElementById("bxCols");
  cols.innerHTML = rivalryHTML(r);
  cols.scrollTop = 0;
  // A meeting without a box score (no lineups that week) can't open one.
  const rows = [...cols.querySelectorAll("[data-rv-box]")];
  [...new Set(rows.map((el) => Number(el.dataset.rvBox)))].forEach((year) => {
    const off = (weeks) => rows.forEach((el) => {
      if (Number(el.dataset.rvBox) !== year || (weeks && weeks.has(Number(el.dataset.week)))) return;
      el.disabled = true;
      el.title = "No box score for this game";
      el.setAttribute("aria-label", el.getAttribute("aria-label").replace(/\. Box score$/, ". No box score"));
    });
    Promise.resolve(year === SEASON ? boxWeeks() : rivalryModel().boxWeeks(year)).then(off, () => off(null));
  });
  const foot = document.getElementById("bxFoot");
  foot.textContent = r.note;
  // Across to the game's box score, unless that is where it came from.
  const from = bxTop();
  const cameFrom = from && from.kind === "box" && from.year === SEASON && from.week === r.end && samePair(from, view);
  if (r.played && !cameFrom) {
    boxWeeks().then((weeks) => {
      if (!weeks.has(r.end) || bxNow !== view) return;
      foot.insertAdjacentHTML("beforeend", `<button type="button" class="rv-switch" data-bx-week="${r.end}" data-bx-a="${a}" data-bx-b="${b}">‹ Box score</button>`);
    });
  }
  bxShown(back);
}

// The box score's way across to the same game's rivalry.
function rivalryCue(week, a, b) {
  return ` <button type="button" class="rv-switch" data-rv-week="${week}" data-rv-a="${a}" data-rv-b="${b}">Rivalry &amp; stakes ›</button>`;
}

// The sheet closing: back to whatever opened the preview.
function rivalryClosed() {
  bxModal.classList.remove("rv-mode");
  const back = rvOpener;
  rvOpener = null;
  if (back && back.isConnected && typeof back.focus === "function") back.focus();
}

document.addEventListener("DOMContentLoaded", () => {
  const sheet = document.getElementById("bxModal");
  if (!sheet) return;
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-team]")) return;
    const meet = event.target.closest("[data-rv-box]");
    if (meet) {
      if (!meet.disabled) bxGo({ kind: "box", week: Number(meet.dataset.week), a: meet.dataset.a, b: meet.dataset.b, year: Number(meet.dataset.rvBox) });
      return;
    }
    const el = event.target.closest("[data-rv-week]");
    if (el) bxGo({ kind: "rv", week: Number(el.dataset.rvWeek), a: el.dataset.rvA, b: el.dataset.rvB });
  });
  // Focus stays in the sheet while it's open.
  sheet.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !sheet.classList.contains("open")) return;
    const items = [...sheet.querySelectorAll("button, [href], summary, [tabindex]:not([tabindex='-1'])")].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
});
