/* Extracts the live data + computation engine out of a season page so the
   newsletter uses exactly the same standings, seeding and playoff-odds code
   the website does. Nothing is reimplemented here.

   The season pages do not all order their blocks the same way — 2026 declares
   its data inside the engine region, the archive pages declare it above — so
   this only prepends the pieces the extracted slice is missing. */
import fs from 'fs';
import path from 'path';

function grab(src, name, open, close) {
  const m = src.match(new RegExp(`const ${name} = \\${open}(.*?)\\n    \\${close};`, 's'));
  return m ? `const ${name} = ${open}${m[1]}\n${close};` : null;
}

export async function loadSeason(season, repoRoot) {
  const file = path.join(repoRoot, `${season}.html`);
  const src = fs.readFileSync(file, 'utf8');

  const start = src.indexOf('    const REGULAR_WEEKS');
  const end = src.indexOf('    /* =================================================================\n       VIEW STATE');
  if (start < 0 || end < 0) {
    throw new Error(`${season}.html has no week-by-week engine — the newsletter needs 2025 or later`);
  }
  const engine = src.slice(start, end);

  const pieces = [];
  const need = (name) => !new RegExp(`const ${name}\\b`).test(engine);

  if (need('teams')) pieces.push(grab(src, 'teams', '{', '}'));
  if (need('divisionOrder')) pieces.push(grab(src, 'divisionOrder', '{', '}'));
  if (need('schedule')) pieces.push(grab(src, 'schedule', '{', '}'));

  if (need('regularGames') && need('results')) {
    pieces.push(grab(src, 'regularGames', '[', ']'));
  }
  // Only the archive pages build their week map from a flat regularGames list;
  // 2026 stores scores per week already, so nothing needs deriving there.

  if (need('fmt')) {
    pieces.push(`const fmt = (n) => Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});`);
  }
  pieces.push(engine);

  // Export only what this season's page actually defines — the archive pages
  // differ (no divisions in 2022-23, no odds engine before 2025).
  const names = ['teams', 'divisionOrder', 'weekResults', 'weekSchedule', 'schedule', 'results',
    'REGULAR_WEEKS', 'TEAM_IDS', 'DIVISION_NAMES', 'computeStats', 'buildPicture',
    'playoffOdds', 'oddsText', 'gamesThrough', 'fmt'];
  const body = pieces.join('\n');
  const defined = names.filter((n) => new RegExp(`(const|function) ${n}\\b`).test(body));
  pieces.push(`export { ${defined.join(', ')} };`);

  // Normalise the two shapes so callers do not care which season they got:
  // the archive pages expose weekResults/weekSchedule, 2026 exposes results/schedule.
  pieces.push(`export const RESULTS = typeof weekResults !== 'undefined' ? weekResults : results;`);
  pieces.push(`export const SCHEDULE = typeof weekSchedule !== 'undefined' ? weekSchedule : schedule;`);

  const tmp = path.join(repoRoot, `.season-${season}.mjs`);
  fs.writeFileSync(tmp, pieces.filter(Boolean).join('\n'));
  try {
    return await import(`file://${tmp}?v=${Date.now()}`);
  } finally {
    fs.unlinkSync(tmp);
  }
}
