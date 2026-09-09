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

/* One raw week, checked far enough that a caller can trust the shape it reads.
   Nothing here interprets the contents — that is the importer's and the week
   tool's job — this only guarantees the fields they key off exist. */
export function readRawWeek(file) {
  const where = path.basename(file);
  const raw = decode(fs.readFileSync(file, 'utf8'), where);

  if (!raw || typeof raw !== 'object') throw new Error(`${where} did not decode to an object`);
  if (typeof raw.week !== 'number') throw new Error(`${where} has no numeric \`week\` — not a weekly export`);
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

/* Every export file in a directory, oldest week first. */
export function readRawDir(dir) {
  const files = fs.readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .sort();
  if (!files.length) throw new Error(`no files in ${dir}`);
  return files.map((f) => readRawWeek(path.join(dir, f))).sort((a, b) => a.week - b.week);
}

/* ESPN team id -> this repo's permanent team id. Owners are permanent, team
   names are not, so the id is the only safe key. Shared with the importer so
   the two can never drift. */
export const ESPN_TEAM = {
  1: 'game', 2: 'kareem', 3: 'hawaii', 4: 'infinity', 5: 'left',
  6: 'hamilton', 7: 'jared', 8: 'laporta', 9: 'roll', 11: 'first',
};
