/* Most-started players per manager, for the all-time page's profile panel,
   and each season's full list of starters per team for that season's page.

   The box scores are 2.4 MB across every week of every season — far too much
   for one profile card to fetch — so this adds them up once into
   boxscores/starters.json. import.mjs calls it after every run, so the file is
   never older than the box scores it summarises. Run it on its own with

     node tools/boxscores/starters.mjs

   Keyed by OWNER, never by team id: ids are reassigned between seasons (see
   tools/newsletter/history.mjs), and a manager keeps their history through a
   rename. league-data.js knows the owner of every archived team; the current
   season is not archived there yet, so its page's teams block is read for the
   owner's name and that name is matched back to an id.

   A start is any game the player was in the starting lineup, playoffs and the
   losers' bracket included — it is still a week he was trusted with a slot.
   Players are matched by name, which is all the export carries. The club
   shown for a season is the one in the box scores, which clubs.mjs has set to
   where he actually played each week. */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { loadSeason } from '../newsletter/season.mjs';
import { buildPlayers } from './players.mjs';

const TOP = 10;

function leagueData(root) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'league-data.js'), 'utf8'), ctx);
  return ctx.window.LEAGUE_DATA;
}

async function ownersFor(season, data, nameToId, root) {
  const archived = data.seasons.find((s) => s.year === season);
  if (archived) {
    return Object.fromEntries(Object.entries(archived.teams).map(([id, t]) => [id, t.ownerId]));
  }
  const { teams } = await loadSeason(season, root);
  return Object.fromEntries(Object.entries(teams).map(([id, t]) => {
    const owner = nameToId[t.owner];
    if (!owner) throw new Error(`${season}: no owner id for "${t.owner}" (team ${id})`);
    return [id, owner];
  }));
}

/* boxscores/<season>/roster.json, read by the team drawer on that season's
   page: every player a team started at least once, most starts first. Each
   week he was on the roster is [points, started (1/0), club]; a week missing
   from `weeks` is one he was not on the team. `clubs` are the clubs he started
   for, most starts first. */
function writeRoster(file, roster) {
  const out = {};
  for (const [teamId, team] of Object.entries(roster)) {
    out[teamId] = {
      weeks: team.weeks.sort((a, b) => a - b),
      players: Object.values(team.players)
        .filter((p) => p.starts)
        .sort((a, b) => b.starts - a.starts || b.pts - a.pts)
        .map((p) => ({ name: p.name, pos: p.pos, starts: p.starts, pts: Math.round(p.pts * 100) / 100,
          clubs: Object.entries(p.clubs).sort((a, b) => b[1] - a[1]).map(([c]) => c), weeks: p.weeks })),
    };
  }
  fs.writeFileSync(file, JSON.stringify(out) + '\n');
}

export async function buildStarters(root) {
  const data = leagueData(root);
  const nameToId = {};
  for (const [id, o] of Object.entries(data.owners)) nameToId[o.name] = id;
  for (const s of data.seasons) for (const t of Object.values(s.teams)) nameToId[t.owner] = t.ownerId;

  const dir = path.join(root, 'boxscores');
  const seasons = fs.readdirSync(dir).filter((f) => /^\d{4}$/.test(f)).map(Number).sort((a, b) => a - b);

  // owner -> player name -> tally
  const tally = {};
  const ownerSeasons = {};
  for (const season of seasons) {
    const owners = await ownersFor(season, data, nameToId, root);
    // Per season, per team: every player the team started, week by week.
    const roster = {};
    const weeks = JSON.parse(fs.readFileSync(path.join(dir, String(season), 'index.json'), 'utf8'));
    for (const week of weeks) {
      const box = JSON.parse(fs.readFileSync(path.join(dir, String(season), `week-${week}.json`), 'utf8'));
      for (const game of box.games) {
        for (const [teamId, lineup] of Object.entries(game.lineups)) {
          const owner = owners[teamId];
          if (!owner) throw new Error(`${season} week ${week}: team ${teamId} has no owner`);
          (ownerSeasons[owner] ||= new Set()).add(season);
          const players = (tally[owner] ||= {});
          const team = (roster[teamId] ||= { weeks: [], players: {} });
          team.weeks.push(week);
          for (const p of lineup) {
            const r = (team.players[p.name] ||= { name: p.name, pos: p.pos, starts: 0, pts: 0, clubs: {}, weeks: {} });
            r.weeks[week] = [p.pts, p.starter ? 1 : 0, p.nfl];
            if (p.starter) {
              r.starts++;
              r.pts += p.pts;
              r.clubs[p.nfl] = (r.clubs[p.nfl] || 0) + 1;
              r.pos = p.pos;
            }
          }
          for (const p of lineup) {
            if (!p.starter) continue;
            const t = (players[p.name] ||= { name: p.name, pos: p.pos, nfl: p.nfl, starts: 0, years: {} });
            t.starts++;
            const y = (t.years[season] ||= { n: 0, clubs: {} });
            y.n++;
            y.clubs[p.nfl] = (y.clubs[p.nfl] || 0) + 1;
            // Seasons and weeks run in order, so the last start seen sets the
            // club and position shown — a traded player shows where he ended up.
            t.nfl = p.nfl;
            t.pos = p.pos;
          }
        }
      }
    }
    writeRoster(path.join(dir, String(season), 'roster.json'), roster);
  }

  const owners = {};
  for (const [owner, players] of Object.entries(tally)) {
    const lastYear = (p) => Math.max(...Object.keys(p.years).map(Number));
    owners[owner] = {
      seasons: [...ownerSeasons[owner]].sort((a, b) => a - b),
      players: Object.values(players)
        .sort((a, b) => b.starts - a.starts || lastYear(b) - lastYear(a) || a.name.localeCompare(b.name))
        .slice(0, TOP)
        // Each season as [starts, club, ...]: the clubs he started for that
        // year, most starts first, so a player traded mid-season lists both.
        .map((p) => ({ ...p, years: Object.fromEntries(Object.entries(p.years).map(([yr, y]) =>
          [yr, [y.n, ...Object.entries(y.clubs).sort((a, b) => b[1] - a[1]).map(([c]) => c)]])) })),
    };
  }

  const out = { seasons, owners };
  fs.writeFileSync(path.join(dir, 'starters.json'), JSON.stringify(out) + '\n');
  // The player card's data comes from the same week files, so it is rebuilt
  // on the same pass.
  await buildPlayers(root, seasons);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const out = await buildStarters(root);
  console.log(`starters.json: ${out.seasons.join(', ')} · ${Object.keys(out.owners).length} managers`);
}
