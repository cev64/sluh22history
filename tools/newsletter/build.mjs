import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeason } from './season.mjs';
import { boxScore } from './fake-box-scores.mjs';
import { loadHistory } from './history.mjs';
import { talkShow, SEGMENTS } from './panel.mjs';

/* Usage:
     node tools/newsletter/build.mjs --season 2026 --week 5
     node tools/newsletter/build.mjs --season 2025 --week 7 --fake   (sample)
     node tools/newsletter/build.mjs --season 2026 --week 5 --box box.json

   --box expects { "<teamId>": { starters:[{pos,name,pts}], bench:[{pos,name,pts}] } }
   Without --box the script requires --fake and stamps the page as a sample, so a
   fabricated lineup can never be mistaken for a real one. */
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEASON = Number(arg('--season', 2026));
const WEEK = Number(arg('--week', 1));
const FAKE = process.argv.includes('--fake');
const BOX_FILE = arg('--box', null);
const OUT_DIR = arg('--out', '.');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMPORTED_PATH = path.join(ROOT, 'boxscores', String(SEASON), `week-${WEEK}.json`);
const imported = (!BOX_FILE && !FAKE && fs.existsSync(IMPORTED_PATH))
  ? JSON.parse(fs.readFileSync(IMPORTED_PATH, 'utf8')) : null;

/* Playwright may be a local dev dependency or a global install; try both
   rather than assuming a layout. */
async function loadChromium() {
  const tries = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright/index.mjs'];
  for (const spec of tries) {
    try { return (await import(spec)).chromium; } catch { /* next */ }
  }
  throw new Error('playwright not found — run `npm i playwright` or run this where it is installed');
}

const E = await loadSeason(SEASON, ROOT);
if (!E.playoffOdds) throw new Error(`${SEASON}.html has no playoff-odds engine`);
if (!E.RESULTS[WEEK] || !E.RESULTS[WEEK].length) throw new Error(`no results posted for ${SEASON} week ${WEEK}`);
if (!BOX_FILE && !FAKE && !fs.existsSync(IMPORTED_PATH)) throw new Error(`no box scores for ${SEASON} week ${WEEK}: import them with tools/boxscores/import.mjs, pass --box <file.json>, or pass --fake for a sample`);
/* Real player lines for this week, if they have been imported. The site reads
   the same file for its box-score modal, so the sheet and the page can never
   disagree about who scored what. Explicit flags still win: --box points at a
   different file, --fake deliberately fabricates. */

/* The newsletter wants { teamId: { starters, bench } }. Injured reserve is
   deliberately left out of the bench: an IR player could not have been
   started, so counting him as a bench call would invent a manager's mistake
   that was never available. */
function boxFromImport(data) {
  const entry = (pl) => ({ pos: pl.pos === 'DST' ? 'D/ST' : pl.pos, slot: pl.slot,
                           name: pl.name, pts: pl.pts, nfl: pl.nfl, proj: pl.proj });
  const out = {};
  for (const g of data.games) {
    for (const id of [g.home, g.away]) {
      const lineup = g.lineups[id] || [];
      out[id] = {
        starters: lineup.filter((pl) => pl.starter).map(entry),
        bench: lineup.filter((pl) => !pl.starter && pl.slot === 'BE').map(entry),
      };
    }
  }
  return out;
}

const realBox = BOX_FILE ? JSON.parse(fs.readFileSync(BOX_FILE, 'utf8'))
  : imported ? boxFromImport(imported) : null;
const FABRICATED = !realBox;
const F2 = n => Number(n).toFixed(2);
const N = id => E.teams[id].name;
const P1 = n => Number(n).toFixed(1);
const tiny = id => short(id).length > 17 ? short(id).slice(0, 16) + '…' : short(id);

/* ---------- derive everything the newsletter talks about ---------- */
const games = E.RESULTS[WEEK].map(([a, as, b, bs], i) => {
  const pick = (id, score, seed) => (realBox && realBox[id]) ? realBox[id] : boxScore(id, score, seed);
  const box = { [a]: pick(a, as, WEEK * 100 + i * 2), [b]: pick(b, bs, WEEK * 100 + i * 2 + 1) };
  return { a, as, b, bs, box, margin: Math.abs(as - bs), win: as > bs ? a : b, lose: as > bs ? b : a };
});

const perf = [];
games.forEach(g => [g.a, g.b].forEach(id =>
  g.box[id].starters.forEach(p => perf.push({ ...p, team: id }))));
perf.sort((x, y) => y.pts - x.pts);

/* A bench player can only come in for a starter whose slot he is eligible for.
   The two flex spots take a running back, receiver or tight end, but a
   quarterback can only replace a quarterback and a defence only a defence —
   comparing the best bench player against the worst starter outright will
   happily suggest starting a quarterback over a defence, which was never a
   choice the manager had. */
const SLOT_ELIGIBLE = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'], 'D/ST': ['D/ST'],
};
// Imported lineups carry both; the fabricated ones name the slot in `pos`.
const slotOf = (pl) => pl.slot || pl.pos;
const canFill = (bench, starter) => (SLOT_ELIGIBLE[slotOf(starter)] || []).includes(bench.pos);

// A bench call only matters if a legal swap would have flipped the result, so
// this takes the best swing available across every eligible pairing rather
// than the biggest gap on the roster.
const blunders = [];
games.forEach(g => {
  [g.a, g.b].forEach(id => {
    if (id === g.win) return;
    const deficit = Math.abs(g.as - g.bs);
    let best = null;
    for (const bench of g.box[id].bench) {
      for (const starter of g.box[id].starters) {
        if (!canFill(bench, starter)) continue;
        const swing = bench.pts - starter.pts;
        if (swing > 0 && (!best || swing > best.swing)) best = { bench, worst: starter, swing };
      }
    }
    if (best && best.swing > deficit) {
      blunders.push({ team: id, bench: best.bench, worst: best.worst, swing: best.swing, deficit, opp: g.win });
    }
  });
});
blunders.sort((x, y) => (y.swing - y.deficit) - (x.swing - x.deficit));

const now = E.buildPicture(WEEK), prev = WEEK > 1 ? E.buildPicture(WEEK - 1) : null;
const odds = E.playoffOdds(WEEK), oddsPrev = WEEK > 1 ? E.playoffOdds(WEEK - 1) : null;
const stats = now.stats;

/* The clinch test is a proof, not an estimate. Where it fires, the sheet must
   print a flat 100% or 0% rather than the simulation's ">99%" — by Week 14 the
   regular season is over and six teams have not "probably" made it, they have
   made it. This is the same deference the season page's odds card makes. */
const FLAGS = now.flags || {};
const settledPlayoff = (id) => (FLAGS[id] === 'z' || FLAGS[id] === 'x' ? 1
  : FLAGS[id] === 'e' ? 0 : null);
const playoffPct = (id) => {
  const settled = settledPlayoff(id);
  return settled === null ? E.oddsText(odds[id].playoff) : `${settled * 100}%`;
};
const playoffBar = (id) => {
  const settled = settledPlayoff(id);
  return ((settled === null ? odds[id].playoff : settled) * 100).toFixed(1);
};
/* Missing the playoffs and going to the Toilet Bowl are the same event, so a
   proof about one settles the other. */
const toiletPct = (id) => {
  const settled = settledPlayoff(id);
  return settled === null ? E.oddsText(odds[id].toilet) : `${(1 - settled) * 100}%`;
};

const movers = oddsPrev ? E.TEAM_IDS
  .map(id => ({ id, delta: odds[id].playoff - oddsPrev[id].playoff }))
  .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 3) : [];

const streaks = E.TEAM_IDS
  .filter(id => stats[id].streak && stats[id].streak.count >= 3)
  .sort((x, y) => stats[y].streak.count - stats[x].streak.count);

const upcoming = [];
for (let w = WEEK + 1; w <= Math.min(WEEK + 2, E.REGULAR_WEEKS); w++) {
  (E.SCHEDULE[w] || []).forEach(([a, b]) => {
    const weight = Math.min(odds[a].playoff, odds[b].playoff) * (1 - Math.abs(odds[a].playoff - odds[b].playoff));
    upcoming.push({ w, a, b, weight });
  });
}
upcoming.sort((x, y) => y.weight - x.weight);

/* ---------- render ---------- */
const chip = id => `<span class="chip" style="--c:${E.teams[id].color}">${E.teams[id].icon}</span>`;
const short = id => N(id).replace(/ \(.*\)/, '').replace('Administration', 'Admin').replace(' McLovins VIII', ' McLovins');

/* The club palette comes from the season page through season.mjs, so the
   sheet and the site badge a player the same way. Positions are deliberately
   not colour-coded — they read as plain text next to the club. */
const nflPill = (pl) => {
  if (!pl.nfl || !E.NFL_TEAMS) return '';
  const c = E.NFL_TEAMS[pl.nfl] || E.NFL_TEAMS.FA;
  return `<span class="pill" style="background:${c};color:${E.readableInk(c)}">${pl.nfl}</span>`;
};

/* The Panel. History is every season before this one; "all-time" inside
   panel.mjs also folds in this season's earlier weeks, so a record claim
   cannot ignore the season it is printed in. A first season has no archive
   behind it, so it simply gets no panel. */
const H = await loadHistory(ROOT, SEASON);
const panelBullets = H.empty ? [] : talkShow({
  E, H, week: WEEK, season: SEASON, games, stats, odds, oddsPrev, now, prev,
  playoffPct, settledPlayoff, F2, P1, short,
});

const panelHtml = panelBullets.length ? `
<div class="panel">
  <div class="phead">
    <h2>The Panel</h2>
    <span>the week, argued out loud &mdash; every line computed from ${H.years[0]}&ndash;${SEASON} league data</span>
  </div>
  <div class="pcols">
    ${SEGMENTS.map(seg => {
      const rows = panelBullets.filter(x => x.seg === seg.id);
      if (!rows.length) return '';
      return `<div class="pcol"><h3>${seg.label}</h3><ul>${rows.map(r =>
        `<li data-pri="${r.pri}">${r.html}</li>`).join('')}</ul></div>`;
    }).join('')}
  </div>
</div>` : '';

const gameCard = g => `
  <div class="g">
    <div class="gh">${g.margin < 10 ? `<b class="tag">${F2(g.margin)} pts</b>` : `Margin ${F2(g.margin)}`}</div>
    ${[[g.a, g.as], [g.b, g.bs]].map(([id, sc]) => `
      <div class="gs ${id === g.win ? 'w' : ''}">
        ${chip(id)}<span class="gn">${short(id)}</span><span class="gp">${F2(sc)}</span>
      </div>`).join('')}
    <div class="gb">${g.box[g.win].starters[0].name} ${P1(g.box[g.win].starters[0].pts)}</div>
  </div>`;

const html = `<!doctype html><meta charset="utf-8"><title>Week ${WEEK} Recap</title>
<style>
  @page { size: letter; margin: 0.42in; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#0b1726; font-size:8.6pt; line-height:1.34; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .mast { display:flex; align-items:flex-end; justify-content:space-between;
          border-bottom:2.5px solid #d71920; padding-bottom:5px; margin-bottom:8px; }
  .mast h1 { margin:0; font-size:17pt; letter-spacing:-.02em; }
  .mast .k { font-size:7pt; font-weight:900; letter-spacing:.16em; text-transform:uppercase; color:#637083; }
  .mast .r { text-align:right; font-size:7.4pt; color:#637083; }
  h2 { font-size:7.4pt; font-weight:900; letter-spacing:.13em; text-transform:uppercase;
       color:#1769e0; margin:9px 0 4px; }
  .scores { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; }
  .g { border:1px solid #dce3eb; border-radius:6px; overflow:hidden; }
  .gh { font-size:6.2pt; font-weight:900; letter-spacing:.07em; text-transform:uppercase; color:#8a95a2;
        background:#f5f7fa; padding:2.5px 5px; border-bottom:1px solid #eef2f6; }
  .gh .tag { color:#d71920; }
  .pill { display:inline-block; padding:0 3px; border-radius:3px; font-size:5.4pt; font-weight:900;
          color:#fff; margin-right:3px; letter-spacing:.03em; vertical-align:1.2px; }
  .gs { display:flex; align-items:center; gap:4px; padding:3.5px 5px; }
  .gs.w { background:rgba(22,131,74,.07); }
  .gs.w .gn, .gs.w .gp { font-weight:900; color:#0b1726; }
  .gn { flex:1; font-size:7.2pt; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#4a5768; }
  .gp { font-size:8pt; font-variant-numeric:tabular-nums; color:#637083; }
  .gb { font-size:6.2pt; color:#8a95a2; padding:2.5px 5px; border-top:1px solid #eef2f6; background:#fcfdfe; }
  .chip { width:13px; height:13px; border-radius:3.5px; background:var(--c); display:inline-grid;
          place-items:center; font-size:7pt; flex:0 0 auto; }
  .cols { display:grid; grid-template-columns:1.15fr 1fr; gap:14px; margin-top:2px; }
  .panel { margin-top:10px; padding-top:7px; border-top:2.5px solid #d71920; }
  .phead { display:flex; align-items:baseline; gap:8px; margin-bottom:5px; }
  .phead h2 { margin:0; font-size:8.4pt; color:#0b1726; letter-spacing:.13em;
              text-transform:uppercase; font-weight:900; }
  .phead span { font-size:6.5pt; color:#8a95a2; }
  .pcols { display:grid; grid-template-columns:repeat(3,1fr); gap:0 15px; align-items:start; }
  .pcol h3 { margin:0 0 3px; font-size:6.5pt; font-weight:900; letter-spacing:.13em;
             text-transform:uppercase; color:#d71920; }
  .pcol ul { margin:0; padding:0; list-style:none; }
  .pcol li { position:relative; margin:0 0 3.4px; padding-left:8px; font-size:7.3pt; line-height:1.33; }
  .pcol li::before { content:"\\2023"; position:absolute; left:0; top:-.5px; color:#c3ccd6; }
  .pcol li b { font-weight:900; }
  ul { margin:0; padding-left:12px; }
  li { margin-bottom:3px; }
  b { color:#0b1726; }
  .rows > div { display:flex; align-items:center; gap:5px; padding:2.6px 0; border-bottom:1px solid #f0f3f7; }
  .rows .nm { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rows .vl { font-variant-numeric:tabular-nums; font-weight:900; }
  .sub { color:#8a95a2; font-size:7pt; }
  .odds > div { display:flex; align-items:center; gap:5px; padding:2.4px 0; }
  .onm { flex:0 0 112px; font-size:7pt; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .divs { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .dh { border:0 !important; padding-bottom:1px !important; }
  .trk { flex:1; height:5px; border-radius:99px; background:#e7ebf0; overflow:hidden; }
  .fil { display:block; height:100%; background:#1769e0; border-radius:99px; }
  .pc { width:30px; text-align:right; font-variant-numeric:tabular-nums; font-weight:900; font-size:7.6pt; }
  .up { color:#16834a; } .dn { color:#d71920; }
  .foot { margin-top:8px; padding-top:5px; border-top:1px solid #dce3eb; font-size:6.4pt; color:#8a95a2;
          display:flex; justify-content:space-between; }
</style>
<div class="mast">
  <div><div class="k">SLUH '22 Fantasy Football</div><h1>Week ${WEEK} Recap</h1></div>
  <div class="r">${SEASON} season · ${new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}<br><b>${games.length} games · ${F2(games.reduce((s,g)=>s+g.as+g.bs,0))} total points</b></div>
</div>

<div class="scores">${games.map(gameCard).join('')}</div>

<div class="cols">
  <div>
    <h2>The Week</h2>
    <ul>
      <li><b>${N(perf[0].team)}</b> got <b>${perf[0].name}</b> (${P1(perf[0].pts)}), the week's best score.</li>
      ${(() => { const t = games.slice().sort((a,b)=>a.margin-b.margin)[0];
        return `<li>Closest game: <b>${short(t.win)}</b> over ${short(t.lose)} by ${F2(t.margin)}.</li>`; })()}
      ${(() => { const t = games.slice().sort((a,b)=>b.margin-a.margin)[0];
        return `<li>Biggest gap: <b>${short(t.win)}</b> by ${F2(t.margin)} over ${short(t.lose)}.</li>`; })()}
      ${streaks.length ? `<li>${streaks.slice(0,2).map(id =>
        `<b>${short(id)}</b> ${stats[id].streak.type === 'W' ? 'has won' : 'has lost'} ${stats[id].streak.count} straight`).join('; ')}.</li>` : ''}
      ${(() => { const hi = games.flatMap(g => [[g.a,g.as],[g.b,g.bs]]).sort((x,y)=>x[1]-y[1])[0];
        return `<li>Quietest afternoon: <b>${short(hi[0])}</b> managed ${F2(hi[1])}.</li>`; })()}
      ${movers.length ? `<li><b>${short(movers[0].id)}</b> saw the week's biggest swing in playoff odds, ${movers[0].delta>=0?'up':'down'} ${Math.abs(Math.round(movers[0].delta*100))} points to ${playoffPct(movers[0].id)}.</li>` : ''}
    </ul>

    <h2>Studs &amp; Duds</h2>
    <div class="rows">
      ${perf.slice(0,5).map(p => `<div>${chip(p.team)}<span class="nm">${nflPill(p)}${p.name} <span class="sub">${p.pos} · ${short(p.team)}</span></span><span class="vl">${P1(p.pts)}</span></div>`).join('')}
      ${perf.filter(p => p.pos !== 'D/ST').slice(-2).map(d =>
        `<div>${chip(d.team)}<span class="nm">${nflPill(d)}${d.name} <span class="sub">${d.pos} · ${short(d.team)} · started</span></span><span class="vl dn">${P1(d.pts)}</span></div>`).join('')}
    </div>

    <h2>Start / Sit</h2>
    ${blunders.length ? `<ul>${blunders.slice(0,2).map(b => `
      <li><b>${short(b.team)}</b> lost by ${F2(b.deficit)} with <b>${b.bench.name}</b> (${P1(b.bench.pts)}) on the bench behind ${b.worst.name} (${P1(b.worst.pts)}). Starting him wins it.</li>`).join('')}</ul>`
      : `<p class="sub">No bench call would have flipped a result this week.</p>`}

    <h2>Standings</h2>
    <div class="divs">
      ${E.DIVISION_NAMES.map(d => `<div class="rows">
        <div class="dh"><span class="sub" style="font-weight:900;letter-spacing:.1em">${d.toUpperCase()}</span></div>
        ${now.divisions[d].map((id,i) => `<div>${chip(id)}<span class="nm">${i+1}. ${short(id)}</span>
        <span class="vl" style="font-size:7.4pt">${stats[id].record}</span></div>`).join('')}</div>`).join('')}
    </div>
  </div>

  <div>
    <h2>Playoff Race</h2>
    <div class="odds">
      ${E.TEAM_IDS.slice().sort((a,b)=>odds[b].playoff-odds[a].playoff).map(id => `
        <div>${chip(id)}<span class="onm">${tiny(id)}</span>
        <span class="trk"><span class="fil" style="width:${playoffBar(id)}%"></span></span>
        <span class="pc">${playoffPct(id)}</span></div>`).join('')}
    </div>

    ${movers.length ? `<h2>Biggest Movers</h2><div class="rows">
      ${movers.map(m => `<div>${chip(m.id)}<span class="nm">${short(m.id)}</span>
      <span class="vl ${m.delta>=0?'up':'dn'}">${m.delta>=0?'+':''}${Math.round(m.delta*100)} pts</span></div>`).join('')}
    </div>` : ''}

    <h2>Toilet Bowl Watch</h2>
    <div class="rows">
      ${E.TEAM_IDS.slice().sort((a,b)=>odds[b].toilet-odds[a].toilet).slice(0,4).map(id => `
        <div>${chip(id)}<span class="nm">${short(id)} <span class="sub">${stats[id].record}</span></span>
        <span class="vl" style="color:#8a95a2">${toiletPct(id)}</span></div>`).join('')}
    </div>

    <h2>Coming Up</h2>
    <ul>
      ${upcoming.slice(0,4).map(u => `<li>Wk ${u.w}: <b>${short(u.a)}</b> vs <b>${short(u.b)}</b>
        <span class="sub">(${playoffPct(u.a)} / ${playoffPct(u.b)})</span></li>`).join('')}
    </ul>
  </div>
</div>
${panelHtml}
<div class="foot">
  <span>League History · leaguehistory site · standings and odds computed from the league rulebook</span>
  <span>${FABRICATED ? '<b>SAMPLE — player-level box scores are fabricated for layout review. Team scores are real.</b>' : `Week ${WEEK} box scores as recorded`}</span>
</div>`;

/* The season pages read this index to decide which weeks offer a download.
   It is rebuilt from the folder's own contents rather than appended to, so
   deleting a PDF and rebuilding is enough to withdraw the link, and a build
   that lands somewhere else can never claim a week it did not write. */
function writeNewsletterIndex(dir) {
  const index = {};
  for (const name of fs.readdirSync(dir)) {
    const m = /^SLUH22-(\d{4})-Week(\d{1,2})-Newsletter\.pdf$/.exec(name);
    if (!m) continue;
    (index[m[1]] = index[m[1]] || []).push(Number(m[2]));
  }
  for (const year of Object.keys(index)) index[year].sort((a, b) => a - b);
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return index;
}

const PAGE_PX = Number(process.env.NEWSLETTER_PAGE_PX || (11 * 96 - 2 * 0.42 * 96));

const pdfPath = path.join(OUT_DIR, `SLUH22-${SEASON}-Week${WEEK}-Newsletter.pdf`);
const chromium = await loadChromium();
const b = await chromium.launch();
/* Measure at the width the sheet actually prints at. A default 1280px viewport
   wraps the text far less than a 7.66in column does, so scrollHeight there
   reports a page that fits while the PDF quietly runs onto a second sheet. */
const PRINT_W = Math.round(8.5 * 96 - 2 * 0.42 * 96);
const p = await b.newPage({ viewport: { width: PRINT_W, height: Math.round(PAGE_PX) } });
await p.setContent(html, { waitUntil: 'networkidle' });

/* The panel is the sheet's shock absorber. Everything above it is fixed by
   the week itself, so the only way to keep a loud week and a quiet week on
   the same single sheet is to render every bullet and then shed the least
   important ones until the page fits. Measuring beats guessing: bullet
   heights depend on how the text wraps, which nothing can predict. */
const panelTrimmed = await p.evaluate((limit) => {
  const dropped = [];
  for (;;) {
    if (document.body.scrollHeight <= limit) break;
    const columns = [...document.querySelectorAll('.pcol')].filter((c) => c.querySelector('li[data-pri]'));
    if (!columns.length) {
      const panel = document.querySelector('.panel');
      if (panel) { panel.remove(); continue; }               // nothing left to shed
      break;
    }
    // The band is as tall as its tallest column, so shedding from a short one
    // changes nothing. Take the least important bullet out of the tallest.
    const tallest = columns.reduce((m, c) => (c.offsetHeight > m.offsetHeight ? c : m));
    const bullets = [...tallest.querySelectorAll('li[data-pri]')];
    const lowest = bullets.reduce((m, el) =>
      (Number(el.dataset.pri) < Number(m.dataset.pri) ? el : m));
    dropped.push(lowest.textContent.replace(/\s+/g, ' ').trim().slice(0, 70));
    lowest.remove();
    if (!tallest.querySelector('li')) tallest.remove();
  }
  return dropped;
}, PAGE_PX);

const panelPrinted = await p.evaluate(() => document.querySelectorAll('.pcol li[data-pri]').length);
await p.pdf({ path: pdfPath, format: 'Letter', printBackground: true });
const height = await p.evaluate(() => document.body.scrollHeight);
await b.close();

if (height > PAGE_PX) {
  console.warn(`WARNING: content is ${height}px against a ${Math.round(PAGE_PX)}px page — it will spill to a second sheet.`);
}
const published = writeNewsletterIndex(OUT_DIR);
console.log(JSON.stringify({ pdf: pdfPath, week: WEEK, season: SEASON, fake: FABRICATED,
  boxSource: BOX_FILE ? 'flag' : FABRICATED ? 'fabricated' : 'imported',
  heightPx: height, onePage: height <= PAGE_PX, benchBlunders: blunders.length,
  panelBullets: panelPrinted, panelTrimmed,
  published }, null, 2));
