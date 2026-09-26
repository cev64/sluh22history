/* boxscores/players.json: every player's whole history in this league, for the
   player card (player-card.js) that opens from a box score, a team's Starters
   list, the all-time page's Most-Started card and its player search.

   One file rather than one per player, so search can run over every name
   without a request per keystroke. Rows are arrays, not objects, to keep it
   small: the whole league history is a few hundred KB before compression.

     seasons        every season with box scores
     regularWeeks   { season: last regular-season week }
     teams          { season: { teamId: [name, ownerId, owner, color] } }
     games          { season: { week: { teamId: [oppId, score, oppScore, label] } } }
                    label is the playoff round from the season page, or
                    "Consolation" for a bracket game the page does not draw;
                    null in the regular season
     players        [{ n: name, p: position, h: Sleeper id or null,
                       r: [[season, week, teamId, slot, pts, proj, club], ...] }]
                    a row for every week he was on a roster, bench and IR
                    included, oldest first

   Built by buildStarters (starters.mjs), which import.mjs and sleeper.mjs
   already run, so it never falls behind the week files. Headshots come from
   boxscores/headshots.json (name -> Sleeper id); see headshots.mjs. */
import fs from 'fs';
import path from 'path';
import { loadSeason } from '../newsletter/season.mjs';

export async function buildPlayers(root, seasons) {
  const dir = path.join(root, 'boxscores');
  const headshotFile = path.join(dir, 'headshots.json');
  const headshots = fs.existsSync(headshotFile) ? JSON.parse(fs.readFileSync(headshotFile, 'utf8')) : {};

  const out = { seasons, regularWeeks: {}, teams: {}, games: {}, players: [] };
  const byName = new Map();

  for (const season of seasons) {
    const E = await loadSeason(season, root);
    out.regularWeeks[season] = E.REGULAR_WEEKS;
    out.teams[season] = Object.fromEntries(Object.entries(E.teams)
      .map(([id, t]) => [id, [t.name.trim(), t.ownerId, t.owner, t.color]]));

    const label = (week, a, b) => {
      if (week <= E.REGULAR_WEEKS) return null;
      const g = ((E.postseason || {})[a] || []).find((p) => p.week === week && p.opponent === b);
      return g ? g.label : 'Consolation';
    };

    const games = (out.games[season] = {});
    const weeks = JSON.parse(fs.readFileSync(path.join(dir, String(season), 'index.json'), 'utf8'));
    for (const week of weeks) {
      const box = JSON.parse(fs.readFileSync(path.join(dir, String(season), `week-${week}.json`), 'utf8'));
      const wk = (games[week] = {});
      for (const g of box.games) {
        wk[g.home] = [g.away, g.homeScore, g.awayScore, label(week, g.home, g.away)];
        wk[g.away] = [g.home, g.awayScore, g.homeScore, label(week, g.away, g.home)];
        for (const [teamId, lineup] of Object.entries(g.lineups)) {
          for (const p of lineup) {
            if (!byName.has(p.name)) byName.set(p.name, { n: p.name, p: p.pos, h: headshots[p.name] || null, r: [] });
            const entry = byName.get(p.name);
            entry.p = p.pos;
            entry.r.push([season, week, teamId, p.slot, p.pts, p.proj, p.nfl]);
          }
        }
      }
    }
  }

  out.players = [...byName.values()].sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify(out) + '\n');
  return out;
}
