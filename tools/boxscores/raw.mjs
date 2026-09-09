/* Reading the league's raw weekly export.

   The export is ESPN-shaped: { year, week, matchups: [{ home, away }] }, each
   side carrying team_id, team_name, score and a players array.

   It reaches this repo three ways and the file on disk looks different in each,
   so every reader goes through here rather than assuming one of them:

     1. plain JSON, saved straight out of the export
     2. base64, which is what Google Drive's download returns
     3. Drive's JSON envelope, { content, id, mimeType, title }, where `content`
        is one of the first two

   Guessing between them is safe because only one can parse: JSON that starts
   with `{` is never valid base64 text we would want, and base64 is never valid
   JSON. Anything that is neither fails loudly, naming the file. */
import fs from 'fs';
import path from 'path';

function decode(text, where) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${where} is empty`);

  if (trimmed[0] === '{' || trimmed[0] === '[') {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`${where} is not valid JSON: ${e.message}`);
    }
    // Drive's envelope: the week is one level down, in whichever encoding.
    if (parsed && typeof parsed.content === 'string' && parsed.matchups === undefined) {
      return decode(parsed.content, `${where} (Drive envelope)`);
    }
    return parsed;
  }

  if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    throw new Error(`${where} is neither JSON nor base64 — is it a screenshot rather than an export?`);
  }
  return decode(Buffer.from(trimmed, 'base64').toString('utf8'), `${where} (base64)`);
}

/* Checked far enough that a caller can trust the shape it reads. Nothing here
   interprets the contents — that is the importer's and the week tool's job —
   this only guarantees the fields they key off exist. */
function checkWeek(raw, where) {
  if (!raw || typeof raw !== 'object') throw new Error(`${where} did not decode to an object`);
  if (typeof raw.week !== 'number') throw new Error(`${where} has no numeric \`week\``);
  if (!Array.isArray(raw.matchups)) throw new Error(`${where} has no \`matchups\` array`);

  for (const m of raw.matchups) {
    for (const side of [m.home, m.away]) {
      if (!side) continue;                                  // playoff byes carry an empty side
      if (typeof side.team_id !== 'number') throw new Error(`${where}: a matchup side has no team_id`);
      if (typeof side.score !== 'number') throw new Error(`${where}: ${side.team_name || 'a team'} has no numeric score`);
      if (!Array.isArray(side.players)) throw new Error(`${where}: ${side.team_name || 'a team'} has no players array`);
    }
  }
  return raw;
}

/* One export file, as a list of weeks.

   Two shapes are accepted, because both have been the export at some point and
   old files should keep working: a whole season, { year, weeks: [...] }, which
   is what the fetcher writes now, and a single week, { year, week, matchups },
   which is what it used to write one file at a time. */
export function readRawFile(file) {
  const where = path.basename(file);
  const raw = decode(fs.readFileSync(file, 'utf8'), where);

  if (raw && Array.isArray(raw.weeks)) {
    if (!raw.weeks.length) throw new Error(`${where} has an empty \`weeks\` list`);
    return raw.weeks.map((w, i) => checkWeek(w, `${where} weeks[${i}]`));
  }
  return [checkWeek(raw, where)];
}

/* Every week in an export, oldest first. Takes the export file itself or a
   directory holding one or more. */
export function readRaw(target) {
  const stat = fs.statSync(target);

  const files = stat.isDirectory()
    ? fs.readdirSync(target)
        .filter((f) => !f.startsWith('.'))
        .filter((f) => fs.statSync(path.join(target, f)).isFile())
        .sort()
        .map((f) => path.join(target, f))
    : [target];

  if (!files.length) throw new Error(`no files in ${target}`);

  const weeks = files.flatMap(readRawFile).sort((a, b) => a.week - b.week);

  // Two files each claiming the same week is a stale copy left behind, and
  // silently picking one of them would post whichever sorted last.
  const seen = new Map();
  for (const w of weeks) {
    if (seen.has(w.week)) throw new Error(`week ${w.week} appears twice in ${target} — remove the stale export`);
    seen.set(w.week, true);
  }
  return weeks;
}

/* ESPN team id -> this repo's permanent team id. Owners are permanent, team
   names are not, so the id is the only safe key. Shared with the importer so
   the two can never drift. */
export const ESPN_TEAM = {
  1: 'game', 2: 'kareem', 3: 'hawaii', 4: 'infinity', 5: 'left',
  6: 'hamilton', 7: 'jared', 8: 'laporta', 9: 'roll', 11: 'first',
};
