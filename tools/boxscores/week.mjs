/* Reads a week straight out of the league's box-score export and posts it to
   the season page — the job a screenshot of the league's results page used to
   do by eye.

   Usage:
     node tools/boxscores/week.mjs --season 2026 --in <dir of raw week files>
     node tools/boxscores/week.mjs --season 2026 --in /tmp/raw --write
     node tools/boxscores/week.mjs --season 2026 --in /tmp/raw --week 5 --write --apply-renames

   Without --write nothing is touched: the run reads the export, checks it, and
   prints what it would post. With --write it edits `results` in <season>.html
   and then reports the standings either side of the new week, which is the
   material the recap is written from.

   The export is the same file `import.mjs` later turns into player-level box
   scores, so the scores on the page and the box score behind a matchup come
   from one source and cannot disagree.

   WHAT IS CHECKED, before anything is written:
     - the week's ten teams and five pairings match `schedule[week]`
     - every team's starters sum to its posted score
     - the week is not already posted
   A run that fails any of these writes nothing. A pairing that disagrees with
   the schedule is either a bad export or a real schedule change, and guessing
   between them corrupts every standing downstream.

   WHAT IS ONLY REPORTED:
     - team names, which change mid-season. The export knows the current name;
       the page and league-data.js have to be told. Renames are printed, and
       applied only with --apply-renames. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeason } from '../newsletter/season.mjs';
import { readRawDir, ESPN_TEAM } from './raw.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const SEASON = Number(arg('--season', 2026));
const IN_DIR = arg('--in', null);
const ONLY_WEEK = arg('--week', null) ? Number(arg('--week')) : null;
const WRITE = has('--write');
const APPLY_RENAMES = has('--apply-renames');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* Everything that can go wrong here is someone's input, not a bug, so it is
   reported as a sentence and an exit code rather than a stack trace. */
function fail(message, detail = []) {
  console.error(`\n${message}`);
  for (const d of detail) console.error('  ' + d);
  process.exit(1);
}

if (!IN_DIR) fail('--in <dir> is required: the folder holding the raw weekly export files');

/* league-data.js keys owners in snake_case; the season page keys them the same
   way in `teams[id].ownerId`, so nothing here needs a second name table. */
const PAGE = path.join(ROOT, `${SEASON}.html`);
const LEAGUE_DATA = path.join(ROOT, 'league-data.js');
const SW = path.join(ROOT, 'sw.js');

const money = (n) => Number(n).toFixed(2);
const num = (n) => String(Math.round(n * 100) / 100);

/* ---------------------------------------------------------------- read */

const season = await loadSeason(SEASON, ROOT);
const { teams, SCHEDULE, RESULTS } = season;

let rawWeeks = [];
try {
  rawWeeks = readRawDir(IN_DIR).filter((r) => ONLY_WEEK === null || r.week === ONLY_WEEK);
} catch (e) {
  fail(`could not read the export: ${e.message}`);
}
if (!rawWeeks.length) {
  fail(ONLY_WEEK === null
    ? `no weekly exports found in ${IN_DIR}`
    : `no export for week ${ONLY_WEEK} in ${IN_DIR}`);
}

const problems = [];
const notes = [];
const pending = [];

for (const raw of rawWeeks) {
  const week = raw.week;
  const where = `week ${week}`;

  if (RESULTS[week] && RESULTS[week].length) { notes.push(`week ${week} is already posted — skipped`); continue; }

  const fixtures = SCHEDULE[week];
  if (!fixtures) {
    // Playoff weeks are the importer's business, checked against `postseason`.
    notes.push(`week ${week} is not a regular-season week on this page — skipped, run import.mjs for it`);
    continue;
  }

  const games = [];
  for (const m of raw.matchups) {
    if (!m.home || !m.away) continue;                       // playoff byes carry an empty side
    const home = ESPN_TEAM[m.home.team_id];
    const away = ESPN_TEAM[m.away.team_id];
    if (!home) { problems.push(`${where}: unknown ESPN team id ${m.home.team_id} ("${m.home.team_name}")`); continue; }
    if (!away) { problems.push(`${where}: unknown ESPN team id ${m.away.team_id} ("${m.away.team_name}")`); continue; }

    for (const [id, side] of [[home, m.home], [away, m.away]]) {
      const starters = side.players.filter((p) => p.lineup_slot !== 'BE' && p.lineup_slot !== 'IR');
      const sum = starters.reduce((t, p) => t + p.points, 0);
      if (Math.abs(sum - side.score) > 0.02) {
        problems.push(`${where} ${id}: starters sum to ${money(sum)}, export posts ${money(side.score)}`);
      }
    }

    games.push({
      [home]: Math.round(m.home.score * 100) / 100,
      [away]: Math.round(m.away.score * 100) / 100,
      pair: [home, away],
      names: { [home]: m.home.team_name, [away]: m.away.team_name },
    });
  }

  /* The export's pairings must be the schedule's pairings — same ten teams,
     same five pairs. Compared as unordered pairs, since which side the export
     calls home is not something the page records. */
  const key = (a, b) => [a, b].sort().join('|');
  const want = new Set(fixtures.map(([a, b]) => key(a, b)));
  const got = new Set(games.map((g) => key(...g.pair)));

  if (games.length !== fixtures.length || want.size !== got.size ||
      [...want].some((k) => !got.has(k))) {
    const show = (s) => [...s].sort().map((k) => k.replace('|', ' v ')).join(', ');
    problems.push(`${where}: pairings do not match schedule[${week}]\n` +
      `      schedule: ${show(want)}\n` +
      `      export:   ${show(got)}`);
    continue;
  }

  // Emitted in schedule order so the posted line reads against the schedule
  // block directly.
  const byKey = new Map(games.map((g) => [key(...g.pair), g]));
  const row = fixtures.map(([a, b]) => {
    const g = byKey.get(key(a, b));
    return { a, as: g[a], b, bs: g[b] };
  });

  const nameSeen = {};
  for (const g of games) for (const [id, name] of Object.entries(g.names)) nameSeen[id] = name;

  pending.push({ week, row, nameSeen });
}

if (problems.length) {
  fail(`${problems.length} problem(s) with the export — nothing was written:`, problems);
}

for (const n of notes) console.log(`note: ${n}`);

if (!pending.length) {
  console.log('\nno new results — every week in the export is already posted');
  process.exit(0);
}

/* --------------------------------------------------------- team names */

/* A current team name lives in two places that must not drift: `teams` on the
   season page, and `owners.<ownerId>.currentTeam` in league-data.js, which is
   what the record book and the trophy room render. The export is the authority
   on what a team is called this week. */
const ldSrc = fs.readFileSync(LEAGUE_DATA, 'utf8');
const currentTeamOf = (ownerId) => {
  const m = ldSrc.match(new RegExp(`"${ownerId}":\\{"name":"[^"]*","currentTeam":"([^"]*)"`));
  return m ? m[1] : null;
};

const renames = [];
const latestName = {};
for (const { nameSeen } of pending) Object.assign(latestName, nameSeen);

for (const [id, exportName] of Object.entries(latestName)) {
  const team = teams[id];
  if (!team) continue;
  const pageName = team.name;
  const bookName = currentTeamOf(team.ownerId);
  if (pageName === exportName && bookName === exportName) continue;
  renames.push({ id, ownerId: team.ownerId, from: pageName, book: bookName, to: exportName });
}

/* ------------------------------------------------------------- report */

const label = (id) => (latestName[id] || teams[id].name);

console.log(`\nSEASON ${SEASON} — ${pending.length} new week(s) from ${path.resolve(IN_DIR)}\n`);

for (const { week, row } of pending) {
  console.log(`WEEK ${week}   five games, checked against schedule[${week}]`);
  console.log(`\n  results[${week}] line:`);
  console.log(`    ${week}: [` + row.map((g) => `["${g.a}", ${num(g.as)}, "${g.b}", ${num(g.bs)}]`).join(', ') + '],');

  const scored = row.flatMap((g) => [{ id: g.a, pts: g.as }, { id: g.b, pts: g.bs }])
    .sort((x, y) => y.pts - x.pts);
  const margins = row.map((g) => {
    const [w, l] = g.as >= g.bs ? [{ id: g.a, pts: g.as }, { id: g.b, pts: g.bs }]
      : [{ id: g.b, pts: g.bs }, { id: g.a, pts: g.as }];
    return { w, l, margin: w.pts - l.pts };
  }).sort((x, y) => x.margin - y.margin);

  console.log('\n  games:');
  for (const m of margins.slice().sort((x, y) => y.margin - x.margin)) {
    console.log(`    ${label(m.w.id)} ${money(m.w.pts)} def. ${label(m.l.id)} ${money(m.l.pts)}   (+${money(m.margin)})`);
  }
  console.log(`\n    high      ${label(scored[0].id)} ${money(scored[0].pts)}`);
  console.log(`    low       ${label(scored[scored.length - 1].id)} ${money(scored[scored.length - 1].pts)}`);
  console.log(`    closest   ${label(margins[0].w.id)} over ${label(margins[0].l.id)} by ${money(margins[0].margin)}`);
  const big = margins[margins.length - 1];
  console.log(`    biggest   ${label(big.w.id)} over ${label(big.l.id)} by ${money(big.margin)}`);
  const total = scored.reduce((t, s) => t + s.pts, 0);
  console.log(`    average   ${money(total / scored.length)} per team\n`);
}

console.log('TEAM NAMES');
if (!renames.length) {
  console.log('  every name in the export matches the page and league-data.js\n');
} else {
  for (const r of renames) {
    console.log(`  RENAME  ${r.id}: "${r.from}" -> "${r.to}"`);
    if (r.book !== r.from) console.log(`          league-data.js currently says "${r.book}"`);
    console.log(`          ${SEASON}.html teams.${r.id}.name, league-data.js owners.${r.ownerId}.currentTeam, and CACHE_VERSION in sw.js`);
  }
  console.log(APPLY_RENAMES
    ? '  applying (--apply-renames)\n'
    : '  not applied — re-run with --apply-renames, or edit the three files by hand\n');
}

if (!WRITE) {
  console.log('nothing written (no --write). Re-run with --write to post these weeks.');
  process.exit(0);
}

/* -------------------------------------------------------------- write */

/* `results` is edited as text rather than regenerated, so weeks already posted
   come out of this byte for byte unchanged. */
function postResults(src, rows) {
  const open = src.indexOf('    const results = {');
  if (open < 0) throw new Error(`${SEASON}.html has no \`const results = {\` block`);

  const empty = src.slice(open).startsWith('    const results = {};');
  const close = empty ? src.indexOf('};', open) + 2 : src.indexOf('\n    };', open);
  if (close < 0) throw new Error('the `results` block is not closed the way this tool expects');

  const lines = rows.map(({ week, row }) =>
    `      ${week}: [` + row.map((g) => `["${g.a}", ${num(g.as)}, "${g.b}", ${num(g.bs)}]`).join(', ') + '],');

  if (empty) {
    return src.slice(0, open) + '    const results = {\n' + lines.join('\n') + '\n    };' + src.slice(close);
  }

  const body = src.slice(open + '    const results = {'.length, close)
    .split('\n').filter((l) => l.trim());
  const weekOf = (l) => { const m = /^\s*(\d+)\s*:/.exec(l); return m ? Number(m[1]) : Infinity; };

  const merged = [...body, ...lines]
    .sort((a, b) => weekOf(a) - weekOf(b))
    // JS allows the trailing comma, and every line carrying one means adding
    // the next week never has to touch the line above it.
    .map((l) => (l.trimEnd().endsWith(',') ? l.trimEnd() : l.trimEnd() + ','));

  return src.slice(0, open) + '    const results = {\n' + merged.join('\n') + src.slice(close);
}

const touched = [];

let pageSrc = fs.readFileSync(PAGE, 'utf8');
try {
  pageSrc = postResults(pageSrc, pending);
} catch (e) {
  fail(`could not post the scores: ${e.message}`);
}

if (APPLY_RENAMES && renames.length) {
  for (const r of renames) {
    // Keep the `ownerId:` column where it is when the new name still fits.
    const line = new RegExp(`^(      ${r.id}:\\s+\\{ name: ")([^"]*)(",)(\\s+)(ownerId:)`, 'm');
    const before = pageSrc;
    pageSrc = pageSrc.replace(line, (_, head, old, tail, gap, rest) => {
      const pad = Math.max(1, gap.length + old.length - r.to.length);
      return head + r.to + tail + ' '.repeat(pad) + rest;
    });
    if (pageSrc === before) fail(`could not find teams.${r.id} in ${SEASON}.html to rename — nothing was written`);
  }
}

fs.writeFileSync(PAGE, pageSrc);
touched.push(`${SEASON}.html`);

if (APPLY_RENAMES && renames.length) {
  let ld = fs.readFileSync(LEAGUE_DATA, 'utf8');
  for (const r of renames) {
    const re = new RegExp(`("${r.ownerId}":\\{"name":"[^"]*","currentTeam":")([^"]*)(")`);
    if (!re.test(ld)) fail(`could not find owners.${r.ownerId}.currentTeam in league-data.js — ${SEASON}.html is already written, so finish the rename by hand`);
    ld = ld.replace(re, `$1${r.to}$3`);
  }
  fs.writeFileSync(LEAGUE_DATA, ld);
  touched.push('league-data.js');

  // league-data.js is served cache-first, so without the bump a returning
  // visitor keeps the old name on the trophy room's locker flag.
  let sw = fs.readFileSync(SW, 'utf8');
  const v = sw.match(/const CACHE_VERSION = 'v(\d+)';/);
  if (!v) fail('could not find CACHE_VERSION in sw.js — bump it by hand, or returning visitors keep the old name');
  const next = `v${Number(v[1]) + 1}`;
  sw = sw.replace(v[0], `const CACHE_VERSION = '${next}';`);
  fs.writeFileSync(SW, sw);
  touched.push(`sw.js (CACHE_VERSION v${v[1]} -> ${next})`);
}

console.log(`WROTE  ${touched.join(', ')}\n`);

/* ------------------------------------------------- standings, re-read */

/* Re-read the page rather than trusting what was just written, and let its own
   engine do the counting — the recap has to describe the same standings a
   reader sees, not a second implementation of them. */
const after = await loadSeason(SEASON, ROOT);
const posted = Object.keys(after.RESULTS).map(Number).sort((a, b) => a - b);
const last = pending[pending.length - 1].week;
const first = pending[0].week;
const played = posted.filter((w) => w <= last).length;

console.log(`weeks posted: ${posted.join(', ')}`);
for (const [id, line] of Object.entries(after.computeStats(last))) {
  if (line.gp !== played) {
    fail(`${id} has ${line.gp} games through week ${last}, expected ${played} — the page was written but the counts are wrong, check it before committing`);
  }
}
console.log(`every team has played ${played} — five games per posted week\n`);

const prevWeek = posted.filter((w) => w < first).pop() || 0;
const before = after.buildPicture(prevWeek);
const now = after.buildPicture(last);
const nameOf = (id) => after.teams[id].name;

console.log(`STANDINGS  after week ${last}${prevWeek ? ` (change since week ${prevWeek})` : ''}`);
for (const div of Object.keys(after.teams).reduce((acc, id) => {
  const d = after.teams[id].division;
  if (!acc.includes(d)) acc.push(d);
  return acc;
}, [])) {
  console.log(`\n  ${div}`);
  now.divisions[div].forEach((id, i) => {
    const was = before.divisions[div].indexOf(id);
    const move = prevWeek === 0 || was === i ? '   ' : (was > i ? ` ▲${was - i}` : ` ▼${i - was}`);
    const s = now.stats[id];
    const seed = now.seedLabels[id] ? now.seedLabels[id].chip : '';
    console.log(`    ${i + 1}. ${nameOf(id).padEnd(28)} ${s.record.padEnd(6)} ${money(s.pf).padStart(8)} PF  ${money(s.pa).padStart(8)} PA  ${seed.padEnd(3)}${move}`);
  });
}

const fieldBefore = new Set(before.playoffField);
const fieldNow = new Set(now.playoffField);
const inNow = now.playoffField.filter((id) => !fieldBefore.has(id));
const outNow = before.playoffField.filter((id) => !fieldNow.has(id));

console.log('\n  playoff field:  ' + now.playoffField.map((id) => `${nameOf(id)} (${now.seedLabels[id].chip})`).join(', '));
if (prevWeek) {
  console.log('  moved in:       ' + (inNow.length ? inNow.map(nameOf).join(', ') : 'nobody'));
  console.log('  moved out:      ' + (outNow.length ? outNow.map(nameOf).join(', ') : 'nobody'));
}
console.log('  first out:      ' + (now.firstOut ? nameOf(now.firstOut) : '—'));
console.log('  toilet order:   ' + now.toiletSeeds.map((id, i) => `#${i + 7} ${nameOf(id)}`).join(', '));
if (now.flips.length) {
  console.log('  tiebreaks:      ' + now.flips.map(([a, b]) => `${nameOf(a)} / ${nameOf(b)}`).join(', '));
}

console.log(`\nnext: write weeklySummaries[${pending.map((p) => p.week).join('], weeklySummaries[')}], then`);
console.log(`      node tools/boxscores/import.mjs --season ${SEASON} --in ${path.resolve(IN_DIR)}`);
