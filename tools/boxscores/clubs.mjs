/* Put every player in a box score on the NFL club he was actually on that week.

   ESPN's export carries one club per player per season, and it is whatever
   ESPN held when the season was pulled — for an archived season, often the
   team he signed with the following spring. 2023's lineups had Saquon Barkley
   on the Eagles and Kirk Cousins on the Falcons; 2024's had Davante Adams a Ram
   all year, when he was a Raider and then a Jet. So `nfl` is rewritten from
   nflverse's weekly rosters, which record the team for every player for every
   week, trades included:

     https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_<season>.csv

   Download that file (it is ~15 MB and not kept in the repo), then

     node tools/boxscores/clubs.mjs --season 2024 --rosters roster_weekly_2024.csv
     node tools/boxscores/clubs.mjs --season 2024 --rosters roster_weekly_2024.csv --write

   Without --write it reports what would change and touches nothing.

   The box scores carry a name, not an id, so players are matched by name —
   normalised for punctuation, accents and Jr./III suffixes, and tried against
   nflverse's nickname as well as the full name, so "Hollywood Brown" and
   "Marquise Brown" meet. Two players with one name are told apart by position,
   then by which of them ESPN's club belongs to. A player nflverse cannot place
   keeps ESPN's club and is listed, so nothing is guessed silently. D/ST rows
   are left alone: a defence's club is in its name.

   A player with no roster row for a week — a bye, or a week the feed skipped —
   takes the nearest week before it (after it, if there is none before). The
   one exception: after his last row, a player ESPN lists as a free agent stays
   a free agent, because he was released.

   Fantasy week N is NFL week N in every season this league has played. Weeks
   already on disk are corrected in place; import.mjs keeps these clubs when it
   rewrites a week, so a later import does not put ESPN's back. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SEASON = Number(arg('--season'));
const ROSTERS = arg('--rosters');
const WRITE = args.includes('--write');
if (!SEASON || !ROSTERS) {
  console.error('usage: clubs.mjs --season <year> --rosters <roster_weekly_<year>.csv> [--write]');
  process.exit(1);
}

// nflverse's codes where they differ from ESPN's, which the site uses.
const CODE = { LA: 'LAR', WAS: 'WSH' };

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const norm = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[.'’]/g, '').replace(/[,-]/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ').replace(/\s+/g, ' ').trim();

// One entry per player (gsis id): his position and club week by week.
/* ESPN names nflverse spells differently and no rule can derive. Add to this
   when the report lists a player it could not find. */
const ALIAS = {
  'Hollywood Brown': 'Marquise Brown',
  'Tank Dell': 'Nathaniel Dell',
  'Joshua Palmer': 'Josh Palmer',
  'Jeff Wilson Jr.': 'Jeffery Wilson',
};

const players = new Map();
for (const r of parseCsv(fs.readFileSync(ROSTERS, 'utf8'))) {
  if (Number(r.season) !== SEASON || r.game_type !== 'REG') continue;
  const id = r.gsis_id || `${r.full_name}|${r.birth_date}`;
  if (!players.has(id)) {
    players.set(id, { id, name: r.full_name, pos: r.position, weeks: {},
      keys: new Set([r.full_name, `${r.football_name} ${r.last_name}`, `${r.first_name} ${r.last_name}`].map(norm)) });
  }
  players.get(id).weeks[Number(r.week)] = CODE[r.team] || r.team;
}
const byName = new Map();
for (const p of players.values()) for (const k of p.keys) {
  if (!byName.has(k)) byName.set(k, []);
  if (!byName.get(k).includes(p)) byName.get(k).push(p);
}

function find(name, pos, espnClub) {
  let c = byName.get(norm(ALIAS[name] || name)) || [];
  if (c.length > 1) { const byPos = c.filter((p) => p.pos === pos); if (byPos.length) c = byPos; }
  if (c.length > 1) { const byClub = c.filter((p) => Object.values(p.weeks).includes(espnClub)); if (byClub.length) c = byClub; }
  return c.length === 1 ? c[0] : null;
}

function clubIn(player, week, espnClub) {
  if (player.weeks[week]) return player.weeks[week];
  const weeks = Object.keys(player.weeks).map(Number).sort((a, b) => a - b);
  const before = weeks.filter((w) => w < week).pop();
  if (before !== undefined && before === weeks[weeks.length - 1] && espnClub === 'FA') return 'FA';
  if (before !== undefined) return player.weeks[before];
  return player.weeks[weeks.find((w) => w > week)];
}

const dir = path.join(ROOT, 'boxscores', String(SEASON));
const weeks = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const unmatched = new Map();
const changed = new Map(); // "name: A → B" -> weeks
let rows = 0, changes = 0;

for (const week of weeks) {
  const file = path.join(dir, `week-${week}.json`);
  const box = JSON.parse(fs.readFileSync(file, 'utf8'));
  let dirty = false;
  for (const game of box.games) {
    for (const lineup of Object.values(game.lineups)) {
      for (const pl of lineup) {
        if (pl.pos === 'DST') continue;
        rows++;
        const match = find(pl.name, pl.pos, pl.nfl);
        if (!match) { unmatched.set(`${pl.name} (${pl.pos}, ${pl.nfl})`, (unmatched.get(`${pl.name} (${pl.pos}, ${pl.nfl})`) || 0) + 1); continue; }
        const club = clubIn(match, week, pl.nfl);
        if (club && club !== pl.nfl) {
          const key = `${pl.name}: ${pl.nfl} → ${club}`;
          if (!changed.has(key)) changed.set(key, []);
          if (!changed.get(key).includes(week)) changed.get(key).push(week);
          pl.nfl = club;
          dirty = true;
          changes++;
        }
      }
    }
  }
  if (dirty && WRITE) fs.writeFileSync(file, JSON.stringify(box, null, 1) + '\n');
}

console.log(`${SEASON}: ${rows} player rows, ${changes} club changes${WRITE ? ' written' : ' (dry run — add --write)'}`);
for (const [k, w] of [...changed].sort()) console.log(`  ${k}  (wk ${w.join(',')})`);
if (unmatched.size) {
  console.log(`  ${unmatched.size} player(s) not found in the rosters, ESPN's club kept:`);
  for (const [k, n] of [...unmatched].sort()) console.log(`    ${k} ×${n}`);
}
