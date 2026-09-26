/* boxscores/headshots.json: box-score player name -> Sleeper player id, so the
   player card can show a photo from Sleeper's CDN
   (https://sleepercdn.com/content/nfl/players/thumb/<id>.jpg).

   Sleeper's player file is ~15 MB and not kept here. Download it and run

     curl https://api.sleeper.app/v1/players/nfl > players_nfl.json
     node tools/boxscores/headshots.mjs --sleeper players_nfl.json

   Rerun it now and then to pick up players new to the league; until then a
   new name simply shows his club logo in place of a photo. Existing entries
   are kept, so a player Sleeper later drops keeps his photo. Matching is by
   normalised name, then position when two players share one; D/ST rows are
   skipped, since a defence shows its club logo. Rebuilds players.json after. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStarters } from './starters.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const i = args.indexOf('--sleeper');
if (i < 0) { console.error('usage: headshots.mjs --sleeper <players_nfl.json>'); process.exit(1); }
const sleeper = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));

const norm = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[.'’]/g, '').replace(/[,-]/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ').replace(/\s+/g, ' ').trim();

const index = new Map();
for (const [id, p] of Object.entries(sleeper)) {
  if (!p.full_name || p.position === 'DEF') continue;
  const k = norm(p.full_name);
  if (!index.has(k)) index.set(k, []);
  index.get(k).push({ id, pos: p.position, active: p.active });
}

// Names Sleeper spells differently, box-score name -> Sleeper's.
const ALIAS = {
  'Nyheim Hines': 'Nyheim Miller-Hines',
  'Robby Anderson': 'Robbie Chosen',
  'Kenneth Gainwell': 'Kenny Gainwell',
  'Gabriel Davis': 'Gabe Davis',
  'Chigoziem Okonkwo': 'Chig Okonkwo',
  'Hollywood Brown': 'Marquise Brown',
  'Bam Knight': 'Zonovan Knight',
};
// Sleeper carries one player twice under two ids; either photo is his.
const FIXED = { 'Ronald Jones II': '5052' };

const dir = path.join(ROOT, 'boxscores');
const file = path.join(dir, 'headshots.json');
const known = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

const names = new Map();
for (const season of fs.readdirSync(dir).filter((f) => /^\d{4}$/.test(f))) {
  for (const f of fs.readdirSync(path.join(dir, season)).filter((f) => /^week-\d+\.json$/.test(f))) {
    for (const g of JSON.parse(fs.readFileSync(path.join(dir, season, f), 'utf8')).games) {
      for (const lineup of Object.values(g.lineups)) for (const p of lineup) if (p.pos !== 'DST') names.set(p.name, p.pos);
    }
  }
}

const missing = [];
for (const [name, pos] of names) {
  if (known[name]) continue;
  if (FIXED[name]) { known[name] = FIXED[name]; continue; }
  let c = index.get(norm(ALIAS[name] || name)) || [];
  if (c.length > 1) { const byPos = c.filter((p) => p.pos === pos); if (byPos.length) c = byPos; }
  if (c.length > 1) { const active = c.filter((p) => p.active); if (active.length) c = active; }
  if (c.length === 1) known[name] = c[0].id;
  else missing.push(`${name} (${pos})${c.length ? ` ×${c.length}` : ''}`);
}

const sorted = Object.fromEntries(Object.entries(known).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
await buildStarters(ROOT);
console.log(`headshots.json: ${Object.keys(sorted).length} players; ${missing.length} without a photo`);
for (const m of missing) console.log('  ' + m);
