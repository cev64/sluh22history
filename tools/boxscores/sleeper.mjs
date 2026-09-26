/* Box scores for a season the league played on Sleeper (2022), written in the
   same shape import.mjs writes from ESPN, so the season page and every tool
   downstream read them without knowing the difference.

   One-off by design: ESPN hosts the league every other year, so this only
   exists to bring 2022 in. It reads a folder of Sleeper's public API
   responses rather than fetching them, so the run is repeatable offline:

     L=856366811673886720   # the 2022 league (previous_league_id of 2026's)
     curl https://api.sleeper.app/v1/league/$L            > league.json
     curl https://api.sleeper.app/v1/league/$L/rosters    > rosters.json
     curl https://api.sleeper.app/v1/league/$L/winners_bracket > winners.json
     curl https://api.sleeper.app/v1/league/$L/losers_bracket  > losers.json
     curl https://api.sleeper.app/v1/players/nfl          > players.json
     for w in $(seq 1 17); do
       curl https://api.sleeper.app/v1/league/$L/matchups/$w > m$w.json
       curl "https://api.sleeper.com/projections/nfl/2022/$w?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF" > proj$w.json
     done

     node tools/boxscores/sleeper.mjs --season 2022 --in <that folder>

   Then put each player on the club he was on that week, since Sleeper's
   player file only knows where he is today:

     node tools/boxscores/clubs.mjs --season 2022 --rosters roster_weekly_2022.csv --write

   What differs from the ESPN import:
   - Sleeper numbers its rosters 1-10; each is matched to the page's team id by
     its season points for, which are unique and on the page.
   - Projections are Sleeper's projected stats priced with this league's own
     scoring settings, the same sum that turns real stats into the points
     Sleeper posted. Its generic PPR figure would ignore the kicker distance
     bonus and the defence's yards-allowed tiers.
   - Sleeper keeps no injury designation per week, so `injury` is null, and no
     injured-reserve slot in a matchup, so there is no IR group.
   - Playoff pairings come from Sleeper's brackets (round r is week 14 + r);
     the regular season from the matchup ids.

   Nothing is written unless every game matches the page — pairing and both
   scores — and every lineup's starters sum to its posted score. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeason } from '../newsletter/season.mjs';
import { buildStarters } from './starters.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SEASON = Number(arg('--season'));
const IN = arg('--in');
if (!SEASON || !IN) {
  console.error('usage: sleeper.mjs --season <year> --in <folder of Sleeper API responses>');
  process.exit(1);
}
const read = (f) => JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));

const SLOT = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLEX', K: 'K', DEF: 'D/ST' };
const POS = { DEF: 'DST' };
const CLUB = { WAS: 'WSH', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', LA: 'LAR' };
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST'];
const round2 = (n) => Math.round(n * 100) / 100;

const league = read('league.json');
const scoring = league.scoring_settings;
const slots = league.roster_positions.filter((s) => s !== 'BN' && s !== 'IR');
const players = read('players.json');
const E = await loadSeason(SEASON, ROOT);

// Roster id -> page team id, by season points for.
const teamOf = {};
for (const r of read('rosters.json')) {
  const pf = r.settings.fpts + (r.settings.fpts_decimal || 0) / 100;
  const hit = Object.entries(E.teams).filter(([, t]) => Math.abs(t.pf - pf) < 0.005);
  if (hit.length !== 1) throw new Error(`roster ${r.roster_id} (${pf} PF) matches ${hit.length} page teams`);
  teamOf[r.roster_id] = hit[0][0];
}

function player(id) {
  const p = players[id];
  if (!p) return { name: id, pos: '?', nfl: 'FA' };
  if (p.position === 'DEF') return { name: `${p.last_name} D/ST`, pos: 'DST', nfl: CLUB[id] || id };
  return { name: p.full_name || `${p.first_name} ${p.last_name}`, pos: POS[p.position] || p.position, nfl: CLUB[p.team] || p.team || 'FA' };
}

const price = (stats) => round2(Object.entries(stats || {}).reduce((t, [k, v]) => t + v * (scoring[k] || 0), 0));

function lineup(entry, proj) {
  const starters = entry.starters.map((id, i) => [id, SLOT[slots[i]]]).filter(([id]) => id && id !== '0');
  const startIds = new Set(starters.map(([id]) => id));
  const row = (id, slot) => ({ ...player(id), slot, pts: round2(entry.players_points[id] || 0),
    proj: proj.has(id) ? price(proj.get(id)) : 0, starter: slot !== 'BE', injury: null });
  const rank = (p) => SLOT_ORDER.indexOf(p.slot);
  return [
    ...starters.map(([id, slot]) => row(id, slot)).sort((a, b) => rank(a) - rank(b) || b.pts - a.pts),
    ...entry.players.filter((id) => !startIds.has(id)).map((id) => row(id, 'BE')).sort((a, b) => b.pts - a.pts),
  ];
}

// Page pairings to check against: regular season from RESULTS, playoffs from postseason.
function pageScore(week, a, b) {
  for (const [x, xs, y, ys] of E.RESULTS[week] || []) {
    if (x === a && y === b) return [xs, ys];
    if (x === b && y === a) return [ys, xs];
  }
  const g = (E.postseason[a] || []).find((p) => p.week === week && p.opponent === b);
  return g ? [g.teamScore, g.oppScore] : null;
}

const brackets = [...read('winners.json'), ...read('losers.json')];
const problems = [];
const out = [];
let checked = 0, sumOnly = 0;

for (let week = 1; week <= 17; week++) {
  const entries = read(`m${week}.json`);
  const byRoster = new Map(entries.map((e) => [e.roster_id, e]));
  const proj = new Map(read(`proj${week}.json`).map((p) => [p.player_id, p.stats]));

  let pairs;
  if (week <= E.REGULAR_WEEKS) {
    const byId = new Map();
    for (const e of entries) (byId.get(e.matchup_id) || byId.set(e.matchup_id, []).get(e.matchup_id)).push(e.roster_id);
    pairs = [...byId.values()];
  } else {
    pairs = brackets.filter((m) => m.r + E.REGULAR_WEEKS === week && m.t1 && m.t2).map((m) => [m.t1, m.t2]);
  }

  const games = [];
  for (const [r1, r2] of pairs) {
    const [a, b] = [r1, r2].map((r) => byRoster.get(r));
    const home = teamOf[r1], away = teamOf[r2];
    const lineups = {};
    for (const [id, e] of [[home, a], [away, b]]) {
      lineups[id] = lineup(e, proj);
      const sum = lineups[id].filter((p) => p.starter).reduce((t, p) => t + p.pts, 0);
      if (Math.abs(sum - e.points) > 0.02) problems.push(`week ${week} ${id}: starters sum to ${sum.toFixed(2)}, score is ${e.points}`);
    }
    const page = pageScore(week, home, away);
    if (page) {
      if (Math.abs(page[0] - a.points) > 0.005 || Math.abs(page[1] - b.points) > 0.005) {
        problems.push(`week ${week} ${home} v ${away}: Sleeper ${a.points}-${b.points}, page ${page[0]}-${page[1]}`);
      }
      checked++;
    } else if (week > E.REGULAR_WEEKS) {
      sumOnly++;   // a bracket game the page does not draw, e.g. the third-place game
    } else {
      problems.push(`week ${week}: ${home} v ${away} is not a pairing on the page`);
    }
    games.push({ home, away, homeScore: round2(a.points), awayScore: round2(b.points), lineups });
  }
  out.push({ week, games });
}

if (problems.length) {
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  throw new Error(`${problems.length} problem(s) — nothing was written`);
}

const dir = path.join(ROOT, 'boxscores', String(SEASON));
fs.mkdirSync(dir, { recursive: true });
for (const { week, games } of out) {
  fs.writeFileSync(path.join(dir, `week-${week}.json`), JSON.stringify({ season: SEASON, week, games }, null, 1) + '\n');
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(out.map((w) => w.week)) + '\n');
await buildStarters(ROOT);

console.log(JSON.stringify({ season: SEASON, weeks: out.length, games: out.reduce((t, w) => t + w.games.length, 0),
  gamesCheckedAgainstPage: checked, gamesCheckedOnlyBySum: sumOnly, teams: teamOf }, null, 2));
