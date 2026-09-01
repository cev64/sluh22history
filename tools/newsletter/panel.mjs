/* The Panel — the talk-show band across the bottom of the newsletter.

   Every line here is computed. Nothing is predicted and nothing is invented: a
   generator that cannot support its claim returns nothing rather than hedging,
   so a quiet week simply gets a shorter panel. That is the whole contract —
   a confidently wrong stat in a league newsletter is worse than no stat.

   "All-time" means every game the league has played through the week being
   written up: the archive seasons plus this season's earlier weeks. A record
   claim that ignored weeks 1-6 of the current season would be wrong.

   Bullets come back sorted by priority. No franchise gets more than two in the
   body; a third is demoted to a reserve that prints last, and a fourth is
   dropped, so a fat week never turns into three bullets about one team while a
   thin week still has something to fill the sheet with. */

const COLD = 'cold', CALL = 'call', NUM = 'num';

/* ---------- helpers ---------- */

const first = (owner) => String(owner).split(' ')[0];
const ord = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

/* This season's completed games, in the same shape history uses, so a record
   can be measured against the archives and the live season together. */
function liveRows(E, season, week) {
  const rows = [];
  for (let w = 1; w <= week; w++) {
    for (const [a, as, b, bs] of (E.RESULTS[w] || [])) {
      for (const [id, oppId, score, oppScore] of [[a, b, as, bs], [b, a, bs, as]]) {
        rows.push({
          year: season, week: w, owner: E.teams[id].owner, opponent: E.teams[oppId].owner,
          teamId: id, name: E.teams[id].name, oppName: E.teams[oppId].name,
          score, oppScore, won: score > oppScore, postseason: false, label: null,
        });
      }
    }
  }
  return rows;
}

export function talkShow(ctx) {
  const { E, H, week, season, games, stats, odds, oddsPrev, now, prev, playoffPct, F2, P1, short } = ctx;
  if (!H || H.empty) return [];

  const ownerOf = (id) => E.teams[id].owner;
  const idOfOwner = (owner) => E.TEAM_IDS.find((id) => E.teams[id].owner === owner) || null;
  const b = (id) => `<b>${short(id)}</b>`;

  const live = liveRows(E, season, week);
  const allRows = [...H.games, ...live];
  const allSorted = allRows.slice().sort((x, y) => y.score - x.score);
  const thisWeek = live.filter((r) => r.week === week);

  const careerOf = (owner) => allRows.filter((r) => r.owner === owner);
  const seasonsPlayed = (owner) => {
    const rec = H.owner(owner);
    return (rec ? rec.seasons.length : 0) + 1;
  };
  /* Regular season only. Every record this league quotes — the standings, the
     season pages, `teams[id].record` — is a regular-season record, so folding
     playoff games into a career line would disagree with simply adding up the
     seasons the site already shows. Best and worst single weeks below do count
     playoff games, because a playoff week is still a week someone scored in. */
  const careerRecord = (owner) => {
    const rows = careerOf(owner).filter((r) => !r.postseason);
    const w = rows.filter((r) => r.won).length;
    return { wins: w, losses: rows.length - w, games: rows.length };
  };

  /* Longest runs anyone has put together, the archives and this season alike.
     Reading the record off the archives only would let a team be told nobody
     has ever done better while another team did better in week 4 of the very
     season being written up. */
  const streakTable = (() => {
    const per = new Map();                                    // "owner|year" -> {w, l}
    const byKey = new Map();
    for (const r of allRows) {
      if (r.postseason) continue;
      const k = `${r.owner}|${r.year}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }
    for (const [k, rows] of byKey) {
      rows.sort((x, y) => x.week - y.week);
      let w = 0, l = 0, bw = 0, bl = 0;
      for (const r of rows) {
        if (r.won) { w += 1; l = 0; } else { l += 1; w = 0; }
        bw = Math.max(bw, w); bl = Math.max(bl, l);
      }
      const [owner, year] = k.split('|');
      per.set(k, { owner, year: Number(year), w: bw, l: bl });
    }
    return per;
  })();

  /* The best run by anyone other than this team in this season — the honest
     bar to measure a live streak against. */
  const streakRecord = (kind, exceptOwner) => {
    let best = null;
    for (const [k, v] of streakTable) {
      if (v.owner === exceptOwner && v.year === season) continue;
      const n = kind === 'W' ? v.w : v.l;
      if (!best || n > best.n) best = { n, owner: v.owner, year: v.year };
    }
    return best;
  };

  const out = [];
  const add = (seg, pri, keys, html) => out.push({ seg, pri, keys, html });

  /* Flags used to suppress redundant pairs later. */
  const said = { allTimeRecord: null, winless: new Set(), unbeaten: new Set() };

  /* ================= COLD OPEN ================= */

  // Unbeaten and winless
  for (const id of E.TEAM_IDS) {
    const s = stats[id];
    if (s.wins >= 2 && s.losses === 0) {
      said.unbeaten.add(id);
      add(COLD, 90, [id], `${b(id)} is still unbeaten at ${s.wins}–0.`);
    }
    if (s.losses >= 2 && s.wins === 0) {
      said.winless.add(id);
      add(COLD, 89, [id], `${b(id)} is still looking for a first win at 0–${s.losses}.`);
    }
  }

  // Streaks, measured against the longest anyone has managed
  for (const id of E.TEAM_IDS) {
    const st = stats[id].streak;
    if (!st || st.count < 3) continue;
    const rec = streakRecord(st.type, ownerOf(id));
    if (!rec) continue;
    if (st.type === 'W') {
      const tail = st.count > rec.n
        ? 'Nobody has ever put together a longer one.'
        : `${first(rec.owner)}'s ${rec.n} in ${rec.year} is the longest anyone has managed.`;
      add(COLD, 82, [id], `${b(id)} has won ${st.count} straight. ${tail}`);
    } else if (!said.winless.has(id)) {
      // A winless team's skid is already the bullet above; printing both says
      // the same thing twice.
      const tail = st.count > rec.n
        ? 'No one has ever lost more in a row.'
        : `${first(rec.owner)}'s ${rec.n} in ${rec.year} is the record skid.`;
      add(COLD, 80, [id], `${b(id)} has lost ${st.count} straight. ${tail}`);
    }
  }

  // The week's biggest move in the odds
  if (oddsPrev) {
    const moves = E.TEAM_IDS
      .map((id) => ({ id, delta: odds[id].playoff - oddsPrev[id].playoff }))
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    const up = moves.find((m) => m.delta > 0.02), down = moves.find((m) => m.delta < -0.02);
    if (up && down) {
      add(COLD, 86, [up.id, down.id],
        `One afternoon moved the room: ${b(up.id)} up ${Math.round(up.delta * 100)} points to ` +
        `${E.oddsText(odds[up.id].playoff)}, ${b(down.id)} down ${Math.abs(Math.round(down.delta * 100))} ` +
        `to ${E.oddsText(odds[down.id].playoff)}.`);
    }
  }

  // A division logjam
  for (const d of E.DIVISION_NAMES) {
    const ids = E.DIVISION_NAMES ? (ctx.now.divisions[d] || []) : [];
    const groups = new Map();
    for (const id of ids) {
      const k = stats[id].record;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(id);
    }
    for (const [record, tied] of groups) {
      if (tied.length < 3) continue;
      const word = tied.length === 3 ? 'three-way' : `${tied.length}-way`;
      add(COLD, 70, tied, `<b>${d}</b> is a ${word} pile-up at ${record}: ${list(tied.map((id) => short(id)))}.`);
    }
  }

  // Who is scoring the most, with their career behind them
  {
    const top = E.TEAM_IDS.map((id) => ({ id, per: stats[id].pf / week }))
      .sort((x, y) => y.per - x.per)[0];
    if (top) {
      const owner = ownerOf(top.id);
      const rec = H.owner(owner);
      const career = careerRecord(owner);
      const trips = rec ? rec.bracketYears.size : 0;
      add(COLD, 60, [top.id],
        `${b(top.id)} leads the league at ${P1(top.per)} a week — ${first(owner)} is ` +
        `${career.wins}–${career.losses} lifetime with ${trips} playoff ${trips === 1 ? 'trip' : 'trips'}.`);
    }
  }

  /* ================= THE CALLBACK ================= */

  const ROUND_WEIGHT = { Championship: 96, Semifinal: 93, Quarterfinal: 91, '5th Place Game': 68 };

  for (const g of games) {
    const oa = ownerOf(g.a), ob = ownerOf(g.b);
    const { meetings, wins } = H.matchup(oa, ob);

    // A rerun of a playoff meeting
    const bracket = meetings.filter((m) => m.postseason && H.isBracketGame(m.label));
    if (bracket.length) {
      const best = bracket.slice().sort((x, y) =>
        (ROUND_WEIGHT[y.label] || 0) - (ROUND_WEIGHT[x.label] || 0) || y.year - x.year)[0];
      const pastWinner = best.winner === oa ? g.a : g.b;
      const pastLoser = best.winner === oa ? g.b : g.a;
      add(CALL, ROUND_WEIGHT[best.label] || 60, [g.a, g.b],
        `A rerun of the <b>${best.year} ${best.label}</b>: ${short(pastWinner)} took that one ` +
        `${F2(best.scores[ownerOf(pastWinner)])}–${F2(best.scores[ownerOf(pastLoser)])}. ` +
        `${b(g.win)} settled it this time, ${F2(Math.max(g.as, g.bs))}–${F2(Math.min(g.as, g.bs))}.`);
    }

    // The deepest rivalry on the slate
    if (meetings.length >= 5) {
      const total = meetings.length + 1;                     // this week's game included
      const aWins = (wins[oa] || 0) + (g.win === g.a ? 1 : 0);
      const bWins = (wins[ob] || 0) + (g.win === g.b ? 1 : 0);
      const series = aWins === bWins
        ? `The series is level at ${aWins}–${bWins}.`
        : `${aWins > bWins ? short(g.a) : short(g.b)} leads it ${Math.max(aWins, bWins)}–${Math.min(aWins, bWins)}.`;
      add(CALL, 84 + Math.min(meetings.length, 12), [g.a, g.b],
        `${b(g.a)} and ${b(g.b)} have now met ${total} times since ${H.years[0]}. ${series}`);
    }
  }

  // Early weeks: how this start has gone before
  if (week <= 6) {
    for (const id of E.TEAM_IDS) {
      const s = stats[id];
      if (s.wins !== week && s.losses !== week) continue;    // only a clean start
      const owner = ownerOf(id);
      const priors = H.startsThrough(owner, week).filter((p) => p.wins === s.wins);
      if (!priors.length) continue;
      const made = priors.filter((p) => p.madeBracket).length;
      const how = made === 0 ? 'and missed the bracket both times'.replace('both', priors.length === 1 ? 'that year' : `all ${priors.length}`)
        : made === priors.length ? `and made the bracket ${priors.length === 1 ? 'that year' : 'every time'}`
        : `and made the bracket in ${made} of them`;
      add(CALL, 76, [id],
        `${b(id)} is ${s.wins}–${s.losses}. ${first(owner)} has started ${s.wins}–${s.losses} before — ` +
        `${list(priors.map((p) => String(p.year)))} — ${how}.`);
    }
  }

  // What this week number has been worth historically
  {
    const bar = H.weekRecord(week);
    const top = thisWeek.slice().sort((x, y) => y.score - x.score)[0];
    if (bar && top) {
      if (top.score > bar.score) {
        add(CALL, 74, [top.teamId],
          `${b(top.teamId)} just set the Week ${week} bar at ${F2(top.score)}, past the ` +
          `${F2(bar.score)} ${bar.name} hung in ${bar.year}.`);
      } else {
        add(CALL, 72, [top.teamId],
          `Week ${week} has a bar: <b>${bar.name}</b> (${first(bar.owner)}) hung ${F2(bar.score)} on ` +
          `${bar.oppName} in ${bar.year}. ${short(top.teamId)} led this one and finished ` +
          `${F2(bar.score - top.score)} short.`);
      }
    }
  }

  // A bracket drought
  for (const id of E.TEAM_IDS) {
    const owner = ownerOf(id);
    const rec = H.owner(owner);
    if (!rec) continue;
    const years = [...rec.bracketYears].sort();
    const lastYear = years[years.length - 1];
    if (years.length && lastYear >= season - 1) continue;    // no drought worth the words
    const line = years.length
      ? `${b(id)} has not made the bracket since ${lastYear}.`
      : `${first(owner)} has never made the bracket.`;
    add(CALL, 68, [id], `${line} This year: ${E.oddsText(odds[id].playoff)}.`);
  }

  // The defending champion
  {
    const defending = H.champions.filter((c) => c.year === season - 1)[0];
    const id = defending ? idOfOwner(defending.owner) : null;
    if (id) {
      const ranked = E.TEAM_IDS.slice().sort((x, y) => odds[y].playoff - odds[x].playoff);
      const place = ranked.indexOf(id) + 1;
      const repeats = H.champions.filter((c, i) =>
        H.champions.some((o) => o.owner === c.owner && o.year === c.year - 1));
      const tail = repeats.length
        ? `Only ${list([...new Set(repeats.map((c) => first(c.owner)))])} has gone back-to-back (${repeats.map((c) => `${c.year - 1}–${c.year}`).join(', ')}).`
        : 'Nobody has ever gone back-to-back.';
      add(CALL, 66, [id],
        `The defending champ ${b(id)} sits ${ord(place)} in the odds at ${E.oddsText(odds[id].playoff)}. ${tail}`);
    }
  }

  // A franchise that keeps finishing last
  for (const id of E.TEAM_IDS) {
    const rec = H.owner(ownerOf(id));
    if (!rec || rec.lastPlaces.length < 2) continue;
    add(CALL, 56, [id],
      `${b(id)} has finished last ${rec.lastPlaces.length} times (${rec.lastPlaces.join(', ')}).`);
  }

  // How few owners have ever won it
  {
    const inLeague = E.TEAM_IDS.map(ownerOf);
    const winners = [...new Set(H.champions.map((c) => c.owner))].filter((o) => inLeague.includes(o));
    if (winners.length && winners.length < inLeague.length) {
      add(CALL, 40, [],
        `${winners.length} of the ${inLeague.length} owners in this league have ever won it: ` +
        `${list(winners.map(first))}.`);
    }
  }

  /* ================= BY THE NUMBERS ================= */

  const weekTop = thisWeek.slice().sort((x, y) => y.score - x.score)[0];
  const weekLow = thisWeek.slice().sort((x, y) => x.score - y.score)[0];

  // Where the week's best lands all-time
  if (weekTop) {
    const better = allSorted.filter((r) => r.score > weekTop.score).length;
    const rank = better + 1;
    if (rank === 1) {
      said.allTimeRecord = weekTop.teamId;
      add(NUM, 96, [weekTop.teamId],
        `${b(weekTop.teamId)} put up ${F2(weekTop.score)} — the biggest week anyone has posted since ${H.years[0]}.`);
    } else if (rank <= 10) {
      add(NUM, 92, [weekTop.teamId],
        `${b(weekTop.teamId)} led the week with ${F2(weekTop.score)}, the ${ord(rank)}-best single week since ${H.years[0]}.`);
    } else {
      const tenth = allSorted[9];
      add(NUM, 88, [weekTop.teamId],
        `${b(weekTop.teamId)} led the week with ${F2(weekTop.score)} — ${F2(tenth.score - weekTop.score)} short of the all-time top ten.`);
    }
  }

  // Personal bests and worsts
  for (const row of thisWeek) {
    const owner = row.owner;
    const career = careerOf(owner).filter((r) => !(r.year === season && r.week === week));
    if (!career.length) continue;
    const prevBest = career.reduce((m, r) => (r.score > m.score ? r : m));
    const prevWorst = career.reduce((m, r) => (r.score < m.score ? r : m));
    // If the all-time record bullet already covered this team, saying "career
    // best" as well is the same fact twice.
    if (row.score > prevBest.score && said.allTimeRecord !== row.teamId) {
      add(NUM, 84, [row.teamId],
        `That is the best week of ${first(owner)}'s career, clearing the ${F2(prevBest.score)} he hung in ${prevBest.year}.`);
    }
    if (row.score < prevWorst.score) {
      add(NUM, 74, [row.teamId],
        `${b(row.teamId)} managed ${F2(row.score)} — the quietest week of ${first(owner)}'s career, under the ${F2(prevWorst.score)} from ${prevWorst.year}.`);
    }
  }

  // This week against every previous version of the same week
  {
    const base = H.weekAverage(week);
    if (base && thisWeek.length) {
      const avg = thisWeek.reduce((t, r) => t + r.score, 0) / thisWeek.length;
      const gap = avg - base.avg;
      add(NUM, 64, [],
        `Teams averaged ${P1(avg)} this week against ${P1(base.avg)} across every Week ${week} since ` +
        `${H.years[0]} — ${P1(Math.abs(gap))} ${gap >= 0 ? 'above' : 'below'} it.`);
    }
  }

  // The best career record in the room
  {
    const rows = E.TEAM_IDS.map((id) => {
      const owner = ownerOf(id);
      const rec = careerRecord(owner);
      return { id, owner, ...rec, pct: rec.games ? rec.wins / rec.games : 0, titles: (H.owner(owner) || { titles: [] }).titles };
    }).filter((r) => r.games >= 20).sort((x, y) => y.pct - x.pct);
    const best = rows[0];
    if (best) {
      const titles = best.titles.length
        ? `, with ${best.titles.length} ${best.titles.length === 1 ? 'title' : 'titles'} (${best.titles.join(', ')})`
        : ' without a title yet';
      add(NUM, 50, [best.id],
        `${b(best.id)} holds the best career record in the league at ${best.wins}–${best.losses} over ` +
        `${seasonsPlayed(best.owner)} seasons${titles}.`);
    }
  }

  // How loud the week was, in league terms
  {
    const totals = [];
    for (let w = 1; w <= week; w++) {
      const rows = live.filter((r) => r.week === w);
      if (rows.length) totals.push({ week: w, total: rows.reduce((t, r) => t + r.score, 0) });
    }
    const here = totals.find((t) => t.week === week);
    if (here && totals.length > 1) {
      const louder = totals.filter((t) => t.total > here.total).length;
      const where = louder === 0 ? 'the loudest week of the season'
        : louder === totals.length - 1 ? 'the quietest week of the season'
        : `the ${ord(louder + 1)}-loudest of the ${totals.length} weeks so far`;
      add(NUM, 46, [], `${F2(here.total)} points league-wide, ${where}.`);
    }
  }

  // The week's quietest afternoon against the season's high
  if (weekLow && weekTop) {
    const seasonHigh = live.reduce((m, r) => (r.score > m.score ? r : m), live[0]);
    if (seasonHigh && seasonHigh.teamId !== weekLow.teamId) {
      add(NUM, 44, [weekLow.teamId],
        `${b(weekLow.teamId)} managed ${F2(weekLow.score)} against a season high of ${F2(seasonHigh.score)} ` +
        `from ${short(seasonHigh.teamId)}.`);
    }
  }

  // Widest margin measured against every game ever played
  {
    const widest = games.slice().sort((x, y) => y.margin - x.margin)[0];
    const closest = games.slice().sort((x, y) => x.margin - y.margin)[0];
    const margins = allRows.filter((r) => r.won).map((r) => r.score - r.oppScore).sort((x, y) => y - x);
    if (widest && margins.length) {
      const bigger = margins.filter((m) => m > widest.margin).length;
      if (bigger < 12) {
        add(NUM, 58, [widest.win],
          `${b(widest.win)} won by ${F2(widest.margin)}, the ${ord(bigger + 1)}-widest beating since ${H.years[0]}.`);
      }
    }
    if (closest && margins.length && closest.margin < 3) {
      const tighter = margins.filter((m) => m < closest.margin).length;
      add(NUM, 57, [closest.win],
        `${b(closest.win)} survived by ${F2(closest.margin)}; only ${tighter} game since ${H.years[0]} has been tighter.`);
    }
  }

  // A career win milestone
  for (const id of E.TEAM_IDS) {
    const owner = ownerOf(id);
    const total = careerRecord(owner).wins;
    if (total > 0 && total % 25 === 0 && thisWeek.some((r) => r.teamId === id && r.won)) {
      add(NUM, 54, [id], `That win was ${first(owner)}'s ${total}th since ${H.years[0]}.`);
    }
  }

  /* ================= THE PLAYOFF RACE =================

     From the back half of the season this is the story, so it carries the
     highest priorities in the panel and survives the trim last.

     Certainty comes from the engine's clinch test, which is a proof rather
     than a simulation — a team is "in" because no remaining result can put it
     out, not because the odds rounded to 100. Everything else here is stated
     as arithmetic the reader can check: wins banked, games left, and what a
     ceiling actually reaches. Nothing claims a clinch the proof has not made. */

  const flags = (now && now.flags) || {};
  const wasFlags = (prev && prev.flags) || {};
  const played = (id) => stats[id].wins + stats[id].losses;
  const left = (id) => E.REGULAR_WEEKS - played(id);
  const ceiling = (id) => stats[id].wins + left(id);
  const divisionOf = (id) => E.teams[id].division;

  // Clinches and eliminations, the week they happen
  for (const id of E.TEAM_IDS) {
    const f = flags[id], was = wasFlags[id];
    if (f === 'z' && was !== 'z') {
      add(COLD, 99, [id], was === 'x'
        ? `${b(id)} locked up the <b>${divisionOf(id)}</b> division and the Week 15 bye.`
        : `${b(id)} clinched the <b>${divisionOf(id)}</b> division and the Week 15 bye.`);
    } else if (f === 'x' && was !== 'x' && was !== 'z') {
      add(COLD, 99, [id], `${b(id)} clinched a playoff berth.`);
    }
    if (f === 'e' && was !== 'e') {
      add(COLD, 98, [id], `${b(id)} was eliminated from playoff contention.`);
    }
  }

  // Who is already through, once it is more than a one-off
  {
    const inAlready = E.TEAM_IDS.filter((id) => flags[id] === 'x' || flags[id] === 'z');
    const outAlready = E.TEAM_IDS.filter((id) => flags[id] === 'e');
    if (inAlready.length >= 2 && inAlready.length < 6) {
      add(COLD, 75, [], `${inAlready.length} teams are already in: ${list(inAlready.map((id) => short(id)))}.`);
    }
    if (outAlready.length >= 2 && outAlready.length < 4) {
      add(COLD, 73, [], `${outAlready.length} teams are already out: ${list(outAlready.map((id) => short(id)))}.`);
    }
  }

  if (week >= 7 && week < E.REGULAR_WEEKS) {
    // The cut line
    const field = (now && now.playoffField) || [];
    const lastIn = field[field.length - 1];
    const firstOut = now && now.firstOut;
    if (lastIn && firstOut) {
      const gap = stats[lastIn].wins - stats[firstOut].wins;
      const apart = gap === 0
        ? `level on ${stats[lastIn].wins} wins, split by the tiebreak`
        : `${gap} ${gap === 1 ? 'game' : 'games'} apart`;
      add(COLD, 88, [lastIn, firstOut],
        `The cut line: ${b(lastIn)} (${stats[lastIn].record}) holds the last spot, ` +
        `${b(firstOut)} (${stats[firstOut].record}) is first out — ${apart} with ${left(firstOut)} to play.`);
    }

    // Next week's biggest game: both live, both close to the line
    const liveness = (id) => (flags[id] ? 0 : 1 - Math.abs(odds[id].playoff - 0.5) * 2);
    const next = (E.SCHEDULE && E.SCHEDULE[week + 1]) || [];
    const bigGame = next
      .map(([a, c]) => ({ a, c, weight: liveness(a) + liveness(c) }))
      .sort((x, y) => y.weight - x.weight)[0];
    if (bigGame && bigGame.weight > 0.6) {
      add(COLD, 87, [bigGame.a, bigGame.c],
        `Week ${week + 1}'s biggest game: ${b(bigGame.a)} (${playoffPct(bigGame.a)}) against ` +
        `${b(bigGame.c)} (${playoffPct(bigGame.c)}), with both still live.`);
    }

    // What winning out is actually worth
    {
      const live = E.TEAM_IDS.filter((id) => !flags[id] && left(id) > 0);
      const target = live.map((id) => ({ id, top: ceiling(id) }))
        .sort((x, y) => y.top - x.top || odds[y.id].playoff - odds[x.id].playoff)[0];
      if (target) {
        const rivals = E.TEAM_IDS.filter((id) => id !== target.id && ceiling(id) > target.top).length;
        const tail = rivals === 0
          ? 'nobody else can finish above that'
          : `only ${rivals} ${rivals === 1 ? 'team' : 'teams'} can finish above that`;
        add(COLD, 82, [target.id],
          `${b(target.id)} wins out and finishes ${target.top}–${E.REGULAR_WEEKS - target.top}; ${tail}.`);
      }
    }

    // A team whose ceiling is running out
    {
      const cutWins = lastIn ? stats[lastIn].wins : null;
      const brink = E.TEAM_IDS
        .filter((id) => !flags[id] && cutWins !== null && ceiling(id) <= cutWins + 1 && left(id) > 0)
        .sort((x, y) => ceiling(x) - ceiling(y))[0];
      if (brink) {
        add(COLD, 79, [brink],
          `${b(brink)} has ${left(brink)} left and a ceiling of ${ceiling(brink)} wins — ` +
          `the last team in is on ${cutWins}.`);
      }
    }

    // The race for the byes
    if (week >= 9) {
      const leaders = E.DIVISION_NAMES.map((d) => (now.divisions[d] || [])[0]).filter(Boolean);
      const chasers = E.DIVISION_NAMES.map((d) => (now.divisions[d] || [])[1]).filter(Boolean);
      const tight = leaders
        .map((id, i) => ({ id, chaser: chasers[i], gap: stats[id].wins - stats[chasers[i]].wins }))
        .filter((r) => r.chaser && r.gap <= 1 && flags[r.id] !== 'z')
        .sort((x, y) => x.gap - y.gap)[0];
      if (tight) {
        // Level on wins is the common case here, and "leads by 0" reads as a
        // bug even though the arithmetic is right.
        const standing = tight.gap === 0
          ? `${b(tight.id)} and ${b(tight.chaser)} are level on ${stats[tight.id].wins} wins`
          : `${b(tight.id)} leads ${b(tight.chaser)} by ${tight.gap}`;
        add(COLD, 76, [tight.id, tight.chaser],
          `The <b>${divisionOf(tight.id)}</b> bye is still open: ${standing} with ${left(tight.id)} to play.`);
      }
    }
  }

  /* ---------- cap, demote, sort ---------- */

  const seen = new Map();
  const kept = [];
  for (const bullet of out.sort((x, y) => y.pri - x.pri)) {
    const keys = bullet.keys || [];
    const most = keys.length ? Math.max(...keys.map((k) => seen.get(k) || 0)) : 0;
    if (most >= 3) continue;                                  // a fourth mention is dropped
    kept.push(most >= 2 ? { ...bullet, pri: bullet.pri - 200 } : bullet);
    keys.forEach((k) => seen.set(k, (seen.get(k) || 0) + 1));
  }
  return kept.sort((x, y) => y.pri - x.pri);
}

export const SEGMENTS = [
  { id: COLD, label: 'Cold Open' },
  { id: CALL, label: 'The Callback' },
  { id: NUM, label: 'By the Numbers' },
];
