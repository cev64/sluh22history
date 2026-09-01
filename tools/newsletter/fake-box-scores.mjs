// Fabricates plausible starting lineups whose points sum exactly to each
// team's real 2025 score. Roster shape is the league's: QB RB RB WR WR TE
// FLEX FLEX D/ST, plus a short bench so start/sit calls can be shown.
import fs from 'fs';

const ROSTERS = {
  first:   { qb:'J. Goff', rb:['B. Robinson','R. Stevenson'], wr:['A. St. Brown','J. Addison'], te:'S. LaPorta', flex:['J. Dobbins','K. Coleman'], dst:'Lions D/ST', bench:['T. Etienne','R. Odunze','B. Aiyuk'] },
  game:    { qb:'J. Allen', rb:['J. Taylor','C. Brown'], wr:['P. Nacua','G. Wilson'], te:'D. Kincaid', flex:['J. Conner','J. Reed'], dst:'Ravens D/ST', bench:['Z. Charbonnet','J. Downs','Q. Johnston'] },
  hamilton:{ qb:'L. Jackson', rb:['S. Barkley','J. Jacobs'], wr:['M. Nabers','C. Olave'], te:'T. Kelce', flex:['B. Irving','X. Worthy'], dst:'Steelers D/ST', bench:['T. Tucker','R. Shaheed','A. Ekeler'] },
  roll:     { qb:'J. Hurts', rb:['J. Cook','K. Walker'], wr:['C. Lamb','D. London'], te:'B. Bowers', flex:['T. Bigsby','J. Meyers'], dst:'Broncos D/ST', bench:['R. White','K. Pitts','D. Achane'] },
  infinity:{ qb:'B. Purdy', rb:['B. Hall','A. Kamara'], wr:['A. Brown','T. Higgins'], te:'T. McBride', flex:['C. Kupp','C. Hubbard'], dst:'Texans D/ST', bench:['J. Mixon','J. Waddle','M. Evans'] },
  hawaii:  { qb:'P. Mahomes', rb:['C. McCaffrey','D. Henry'], wr:['J. Jefferson','N. Collins'], te:'G. Kittle', flex:['J. Smith-Njigba','D. Swift'], dst:'Eagles D/ST', bench:['C. Ridley','T. Pollard','J. Ferguson'] },
  left:    { qb:'J. Daniels', rb:['T. Benson','B. Corum'], wr:['C. Ridley','T. Hill'], te:'M. Andrews', flex:['A. Jones','K. Allen'], dst:'Vikings D/ST', bench:['N. Chubb','D. Njoku','R. Doubs'] },
  kareem:  { qb:'D. Prescott', rb:['K. Williams','N. Harris'], wr:['D. Moore','C. Sutton'], te:'J. Smith', flex:['T. Spears','D. Samuel'], dst:'Packers D/ST', bench:['A. Dillon','W. Robinson','C. Godwin'] },
  laporta: { qb:'C. Stroud', rb:['D. Montgomery','C. Edwards'], wr:['D. Metcalf','J. Chase'], te:'C. Kmet', flex:['R. Mostert','K. Shakir'], dst:'Bills D/ST', bench:['B. Bowers','R. Rice','C. Kirk'] },
  jared:   { qb:'B. Nix', rb:['J. Williams','J. Warren'], wr:['R. Rice','J. Jeudy'], te:'D. Goedert', flex:['T. Chandler','D. Slayton'], dst:'Jets D/ST', bench:['T. Etienne','G. Pickens','I. Pacheco'] }
};

// Share of a team's total by slot. Sums to 1; jittered per game.
const SHARE = { qb:0.19, rb1:0.15, rb2:0.11, wr1:0.14, wr2:0.10, te:0.09, flex1:0.11, flex2:0.07, dst:0.04 };

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

export function boxScore(teamId, total, seed) {
  const r = mulberry32(seed);
  const R = ROSTERS[teamId];
  const slots = [
    ['QB', R.qb, SHARE.qb], ['RB', R.rb[0], SHARE.rb1], ['RB', R.rb[1], SHARE.rb2],
    ['WR', R.wr[0], SHARE.wr1], ['WR', R.wr[1], SHARE.wr2], ['TE', R.te, SHARE.te],
    ['FLEX', R.flex[0], SHARE.flex1], ['FLEX', R.flex[1], SHARE.flex2], ['D/ST', R.dst, SHARE.dst]
  ];
  // jitter shares, renormalise, then fix rounding onto the largest scorer
  let raw = slots.map(([pos,name,share]) => ({ pos, name, w: Math.max(0.01, share * (0.55 + r() * 0.95)) }));
  const wsum = raw.reduce((s,x)=>s+x.w,0);
  raw = raw.map(x => ({ ...x, pts: Math.round(total * x.w / wsum * 10) / 10 }));
  const drift = Math.round((total - raw.reduce((s,x)=>s+x.pts,0)) * 100) / 100;
  raw.sort((a,b)=>b.pts-a.pts);
  raw[0].pts = Math.round((raw[0].pts + drift) * 100) / 100;
  const bench = R.bench.map((name,i) => ({
    name, pos: ['RB','WR','TE'][i % 3],
    pts: Math.round((total / 9) * (0.35 + r() * 1.5) * 10) / 10
  }));
  return { starters: raw, bench };
}

export const ROSTER_TABLE = ROSTERS;
