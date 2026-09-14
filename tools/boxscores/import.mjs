/* Turns the league export's weekly box-score files into the per-week files the
   site and the newsletter read.

   Usage:
     node tools/boxscores/import.mjs --season 2025 --in <dir of raw week files>
     node tools/boxscores/import.mjs --season 2026 --in /tmp/raw --week 5

   The raw files are ESPN-shaped: { year, week, matchups: [{ home, away }] },
   each side carrying team_id, team_name, score and a players array. They are
   read through raw.mjs, which is also what `week.mjs` posts the scores from, so
   the box score behind a matchup and the score on the page cannot come from
   different files. Two things about them need handling rather than trusting:

   1. `position` is shifted by one against what it claims. Every player in a TE
      lineup slot reports position "WR", every WR reports "RB/WR", every QB
      reports "TQB". Colouring a page by the raw field would call every tight
      end a receiver, so POSITION translates it and the run FAILS if a starter's
      translated position ever disagrees with the slot it started in — that
      check is what keeps the mapping honest if the export changes.

   2. Teams are identified by an ESPN team id, and team names change during a
      season. espnTeams(season) (in raw.mjs) maps id to this repo's team id;
      nothing keys off the name.

   Nothing is written unless the week validates against the season page: same
   pairings, same scores, and every team's starters summing to its posted
   score. A box score that disagrees with the standings is a bad import, not a
   new fact. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeason } from '../newsletter/season.mjs';
import { readRaw, espnTeams } from './raw.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEASON = Number(arg('--season', 2025));
const IN_DIR = arg('--in', null);
const ONLY_WEEK = arg('--week', null) ? Number(arg('--week')) : null;

/* A starter list that does not add up to its own team's score normally fails
   the run, because a box score contradicting the score above it is the one
   thing this importer exists to prevent. `--allow-sum-gap` downgrades just
   that one check to a warning, for the case where the export itself is short:
   ESPN restating a team total without restating the player rows behind it.
   Nothing else relaxes - a pairing the page does not have, a score that
   disagrees with the page, an unknown team, an unmapped position all still
   stop the run. Used for 2023 week 14, where two lineups come up 2.00 and
   3.30 shy of totals the page and the export agree on. */
const ALLOW_SUM_GAP = process.argv.includes('--allow-sum-gap');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

if (!IN_DIR) throw new Error('--in <dir> is required: the folder holding the raw weekly export files');

/* Raw `position` value -> the position it actually is. See the note above.
   `WR/TE` is the kicker: every starter carrying it played the K slot, in both
   2021 and 2023. The league dropped the kicker after 2023, so the seasons from
   2024 on simply never produce one. */
const POSITION = { TQB: 'QB', RB: 'RB', 'RB/WR': 'WR', WR: 'TE', 'WR/TE': 'K', 'D/ST': 'DST' };

/* A starter's slot proves its position, except FLEX which accepts several. */
const SLOT_IMPLIES = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', 'D/ST': 'DST' };

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST'];

function normalisePlayer(p) {
  const pos = POSITION[p.position];
  if (!pos) throw new Error(`unmapped position "${p.position}" on ${p.name} — the export changed shape`);
  return {
    name: p.name,
    pos,
    nfl: p.pro_team || null,
    slot: p.lineup_slot,
    pts: Math.round(p.points * 100) / 100,
    proj: Math.round(p.projected_points * 100) / 100,
    starter: p.lineup_slot !== 'BE' && p.lineup_slot !== 'IR',
    injury: p.injury_status === 'ACTIVE' ? null : p.injury_status,
  };
}

/* Starters in lineup order, then the bench by points, then injured reserve.
   IR is kept apart from the bench on purpose: an IR player could not have been
   started, so counting him as a bench call would invent a manager's mistake. */
function orderLineup(players) {
  const rank = (p) => {
    const i = SLOT_ORDER.indexOf(p.slot);
    return i === -1 ? SLOT_ORDER.length : i;
  };
  const starters = players.filter((p) => p.starter).sort((a, b) => rank(a) - rank(b) || b.pts - a.pts);
  const bench = players.filter((p) => !p.starter && p.slot === 'BE').sort((a, b) => b.pts - a.pts);
  const ir = players.filter((p) => p.slot === 'IR').sort((a, b) => b.pts - a.pts);
  return [...starters, ...bench, ...ir];
}

const E = await loadSeason(SEASON, ROOT);
const RESULTS = E.RESULTS;
const POSTSEASON = E.postseason || {};

/* The regular season is checked against `results`; the playoff weeks against
   `postseason`, which the bracket is drawn from.

   The page does not record every playoff game — it carries the nine the
   bracket shows, while the export also has the consolation games nobody
   displays. Those extra games are still imported, but they can only be
   checked against themselves, so the run reports the two counts separately
   rather than implying the page vouched for all of them. */
function postseasonPairing(week, a, b) {
  const entries = POSTSEASON[a] || [];
  return entries.find((g) => g.week === week && g.opponent === b) || null;
}

function postseasonWeeks() {
  const weeks = new Set();
  for (const games of Object.values(POSTSEASON)) for (const g of games) weeks.add(g.week);
  return weeks;
}
const POST_WEEKS = postseasonWeeks();

const TEAM_BY_ESPN = espnTeams(SEASON);
const rawWeeks = readRaw(IN_DIR);

const outDir = path.join(ROOT, 'boxscores', String(SEASON));
fs.mkdirSync(outDir, { recursive: true });

const problems = [];
const pending = [];
const sumGaps = [];
const written = [];
let playerCount = 0;
let crossChecked = 0;
let sumOnly = 0;

for (const raw of rawWeeks) {
  const week = raw.week;
  if (ONLY_WEEK !== null && week !== ONLY_WEEK) continue;

  // A week counts if the page has posted results for it, or if it is one of
  // the playoff weeks the bracket is built from.
  const posted = RESULTS[week];
  const isPost = POST_WEEKS.has(week);
  if ((!posted || !posted.length) && !isPost) { continue; }

  const bySite = new Map();
  (posted || []).forEach(([a, as, b, bs]) => bySite.set([a, b].sort().join('|'), { [a]: as, [b]: bs }));

  const games = [];
  for (const m of raw.matchups) {
    if (!m.home || !m.away) continue;                   // playoff byes carry an empty side
    const home = TEAM_BY_ESPN[m.home.team_id];
    const away = TEAM_BY_ESPN[m.away.team_id];
    if (!home || !away) { problems.push(`week ${week}: unknown ESPN team id`); continue; }

    const key = [home, away].sort().join('|');
    const site = bySite.get(key);
    const post = isPost ? postseasonPairing(week, home, away) : null;

    if (site) {
      if (Math.abs(site[home] - m.home.score) > 0.005 || Math.abs(site[away] - m.away.score) > 0.005) {
        problems.push(`week ${week} ${home} v ${away}: export ${m.home.score}-${m.away.score}, page ${site[home]}-${site[away]}`);
        continue;
      }
      crossChecked++;
    } else if (post) {
      if (Math.abs(post.teamScore - m.home.score) > 0.005 || Math.abs(post.oppScore - m.away.score) > 0.005) {
        problems.push(`week ${week} ${home} v ${away} (${post.label}): export ${m.home.score}-${m.away.score}, page ${post.teamScore}-${post.oppScore}`);
        continue;
      }
      crossChecked++;
    } else if (isPost) {
      // A real playoff game the bracket does not display, so there is nothing
      // on the page to check it against. The starter-sum check below still
      // applies, and the run reports how many landed here.
      sumOnly++;
    } else {
      problems.push(`week ${week}: ${home} v ${away} is not a pairing on the season page`);
      continue;
    }

    const lineups = {};
    for (const [id, side] of [[home, m.home], [away, m.away]]) {
      const players = side.players.map(normalisePlayer);
      for (const p of players) {
        if (p.starter && SLOT_IMPLIES[p.slot] && SLOT_IMPLIES[p.slot] !== p.pos) {
          problems.push(`week ${week} ${id}: ${p.name} started at ${p.slot} but reads as ${p.pos}`);
        }
      }
      const sum = players.filter((p) => p.starter).reduce((t, p) => t + p.pts, 0);
      if (Math.abs(sum - side.score) > 0.02) {
        const note = `week ${week} ${id}: starters sum to ${sum.toFixed(2)}, posted score is ${side.score}`;
        if (ALLOW_SUM_GAP) sumGaps.push(note);
        else problems.push(note);
      }
      lineups[id] = orderLineup(players);
      playerCount += players.length;
    }

    games.push({
      home, away,
      homeScore: Math.round(m.home.score * 100) / 100,
      awayScore: Math.round(m.away.score * 100) / 100,
      lineups,
    });
  }

  if (games.length) pending.push({ week, games });
}

if (problems.length) {
  // Refuse the whole run: a partially-correct box score is worse than none,
  // because everything downstream would present it as audited. Weeks are held
  // in memory until here for that reason — writing them as they validated
  // meant a failing run still left the good ones on disk under a message
  // saying nothing had been written.
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  throw new Error(`${problems.length} validation problem(s) — nothing was written`);
}

for (const { week, games } of pending) {
  fs.writeFileSync(path.join(outDir, `week-${week}.json`),
    JSON.stringify({ season: SEASON, week, games }, null, 1) + '\n');
  written.push(week);
}

// The site asks for this to decide which matchups are clickable.
const have = fs.readdirSync(outDir)
  .map((f) => /^week-(\d+)\.json$/.exec(f))
  .filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(have) + '\n');

if (sumGaps.length) {
  console.error(`  accepted ${sumGaps.length} starter-sum gap(s) under --allow-sum-gap:`);
  for (const g of sumGaps) console.error('    ' + g);
}

console.log(JSON.stringify({ season: SEASON, weeks: written.sort((a, b) => a - b), players: playerCount,
  gamesCheckedAgainstPage: crossChecked, gamesCheckedOnlyBySum: sumOnly,
  acceptedSumGaps: sumGaps, index: have }, null, 2));
