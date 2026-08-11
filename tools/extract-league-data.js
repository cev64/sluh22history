#!/usr/bin/env node
/* Lifts the LEAGUE_DATA blob out of index.html and writes it to the Android
   app's assets. index.html stays the single source of truth for league
   results, so re-run this after editing a season on the web record book:

     node tools/extract-league-data.js
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'index.html');
const TARGET = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'league.json');

const html = fs.readFileSync(SOURCE, 'utf8');
const match = html.match(/const LEAGUE_DATA = (\{[\s\S]*?\});\n/);

if (!match) {
  console.error('Could not find LEAGUE_DATA in index.html');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(match[1]);
} catch (err) {
  console.error('LEAGUE_DATA is not valid JSON:', err.message);
  process.exit(1);
}

const owners = Object.keys(data.owners || {}).length;
const seasons = (data.seasons || []).length;

if (!owners || !seasons) {
  console.error(`Refusing to write an empty dataset (owners=${owners}, seasons=${seasons})`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, JSON.stringify(data, null, 2) + '\n');

console.log(`Wrote ${path.relative(ROOT, TARGET)} - ${owners} owners, ${seasons} seasons`);
