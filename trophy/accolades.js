/* Turns the raw league record into the list of things the hall puts on a
   pedestal. Nothing here knows about three.js — it produces plain exhibit
   objects, and the 3D layer decides how to sculpt each `kind`.

   The hall is one continuous gallery divided into wings. Wing order is the
   order you walk past them, so it doubles as the rail order. */

const PLAYOFF_ROUNDS = ["Quarterfinal", "Semifinal", "Championship"];

// The 2020 season was deleted before this record book existed; only the
// champion survives. alltime.html carries the same exception.
const LOST_SEASON = {
  year: 2020,
  ownerId: "charlie_vonderheid",
  note: "The 2020 season was lost when the old league site went dark. The title stands; the box scores do not."
};

const fmt = (value, digits = 2) =>
  Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmt0 = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });

const ordinal = (n) => {
  const rules = new Intl.PluralRules("en-US", { type: "ordinal" });
  const suffix = { one: "st", two: "nd", few: "rd", other: "th" }[rules.select(n)];
  return `${n}${suffix}`;
};

/* Every game of every season, flattened, with both sides resolved to their
   team record for that year. Almost every record below is a scan over this. */
function flattenGames(data) {
  const rows = [];
  data.seasons.forEach((season) => {
    const push = (game, stage) => {
      const a = season.teams[game.a];
      const b = season.teams[game.b];
      if (!a || !b) return;
      rows.push({
        year: season.year,
        week: game.week,
        stage,
        label: game.label || "Regular Season",
        winner: game.aScore >= game.bScore ? a : b,
        loser: game.aScore >= game.bScore ? b : a,
        winScore: Math.max(game.aScore, game.bScore),
        loseScore: Math.min(game.aScore, game.bScore),
        sides: [
          { team: a, points: game.aScore, opponent: b, against: game.bScore },
          { team: b, points: game.bScore, opponent: a, against: game.aScore }
        ]
      });
    };
    season.regularGames.forEach((game) => push(game, "regular"));
    season.postseasonGames.forEach((game) => push(game, "post"));
  });
  return rows;
}

/* Per-owner career totals. Teams whose owner has left the league (they are in
   the season standings but not in the owners map) are counted in the game
   records but get no hall-of-fame pillar — same rule the record book uses. */
function careerTotals(data) {
  const careers = {};
  Object.entries(data.owners).forEach(([ownerId, owner]) => {
    careers[ownerId] = {
      ownerId,
      ...owner,
      seasons: [],
      wins: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      titles: [],
      cellars: [],
      finishes: [],
      playoffWins: 0,
      playoffLosses: 0,
      bestWeek: null
    };
  });

  data.seasons.forEach((season) => {
    const size = Object.keys(season.teams).length;
    Object.values(season.teams).forEach((team) => {
      const career = careers[team.ownerId];
      if (!career || team.excludeFromHome) return;
      career.seasons.push({ year: season.year, ...team });
      career.wins += team.wins;
      career.losses += team.losses;
      career.pf += team.pf;
      career.pa += team.pa;
      career.finishes.push({ year: season.year, rank: team.finalRank });
      if (team.finalRank === 1) career.titles.push(season.year);
      if (team.officialLastPlace || team.finalRank === size) career.cellars.push(season.year);
    });

    season.postseasonGames.forEach((game) => {
      if (!PLAYOFF_ROUNDS.includes(game.label)) return;
      const a = season.teams[game.a];
      const b = season.teams[game.b];
      const won = game.aScore >= game.bScore ? a : b;
      const lost = game.aScore >= game.bScore ? b : a;
      if (careers[won.ownerId]) careers[won.ownerId].playoffWins += 1;
      if (careers[lost.ownerId]) careers[lost.ownerId].playoffLosses += 1;
    });
  });

  flattenGames(data).forEach((row) => {
    row.sides.forEach((side) => {
      const career = careers[side.team.ownerId];
      if (!career) return;
      if (!career.bestWeek || side.points > career.bestWeek.points) {
        career.bestWeek = { points: side.points, year: row.year, week: row.week };
      }
    });
  });

  if (careers[LOST_SEASON.ownerId] && !careers[LOST_SEASON.ownerId].titles.includes(LOST_SEASON.year)) {
    careers[LOST_SEASON.ownerId].titles.unshift(LOST_SEASON.year);
  }

  Object.values(careers).forEach((career) => {
    career.games = career.wins + career.losses;
    career.pct = career.games ? career.wins / career.games : 0;
    career.ppg = career.games ? career.pf / career.games : 0;
    career.bestFinish = career.finishes.length ? Math.min(...career.finishes.map((f) => f.rank)) : null;
    career.podiums = career.finishes.filter((f) => f.rank <= 3).length;
  });

  return careers;
}

/* Longest run of wins by one manager, counted through a single season in
   played order (regular season, then the bracket). Streaks do not carry
   across years — a new draft is a new team. */
function longestStreak(data) {
  let best = null;
  data.seasons.forEach((season) => {
    const byTeam = {};
    const ordered = [
      ...season.regularGames.map((g) => ({ ...g, order: g.week })),
      ...season.postseasonGames.map((g) => ({ ...g, order: g.week + 0.5 }))
    ].sort((x, y) => x.order - y.order);

    ordered.forEach((game) => {
      [[game.a, game.aScore, game.bScore], [game.b, game.bScore, game.aScore]].forEach(([key, mine, theirs]) => {
        const team = season.teams[key];
        if (!team) return;
        const state = byTeam[key] || (byTeam[key] = { run: 0, from: null });
        if (mine > theirs) {
          if (!state.run) state.from = game.week;
          state.run += 1;
          if (!best || state.run > best.run) {
            best = { run: state.run, team, year: season.year, from: state.from, to: game.week };
          }
        } else {
          state.run = 0;
        }
      });
    });
  });
  return best;
}

function championExhibits(data, careers) {
  const items = [];

  items.push({
    id: "champ-2020",
    kind: "cup",
    lost: true,
    year: LOST_SEASON.year,
    title: "2020",
    subtitle: careers[LOST_SEASON.ownerId].currentTeam,
    owner: careers[LOST_SEASON.ownerId].name,
    ownerId: LOST_SEASON.ownerId,
    icon: careers[LOST_SEASON.ownerId].icon,
    color: careers[LOST_SEASON.ownerId].color,
    plate: "2020 CHAMPION",
    blurb: LOST_SEASON.note,
    stats: [{ label: "Champion", value: careers[LOST_SEASON.ownerId].name }],
    links: []
  });

  data.seasons.forEach((season) => {
    const champ = Object.values(season.teams).find((team) => team.finalRank === 1);
    if (!champ) return;
    const runnerUp = Object.values(season.teams).find((team) => team.finalRank === 2);
    const final = season.postseasonGames.find((game) => game.label === "Championship");
    const size = Object.keys(season.teams).length;

    let finalLine = "";
    if (final) {
      const a = season.teams[final.a];
      const won = final.aScore >= final.bScore;
      const champScore = a === champ ? final.aScore : final.bScore;
      const foeScore = a === champ ? final.bScore : final.aScore;
      const foe = a === champ ? season.teams[final.b] : a;
      finalLine = `${fmt(champScore)} – ${fmt(foeScore)} over ${foe.name}`;
      void won;
    }

    items.push({
      id: `champ-${season.year}`,
      kind: "cup",
      year: season.year,
      title: String(season.year),
      subtitle: champ.name,
      owner: champ.owner,
      ownerId: champ.ownerId,
      icon: champ.icon,
      color: champ.color,
      plate: `${season.year} CHAMPION`,
      blurb: `${champ.owner} took the ${season.year} title with ${champ.name}, finishing ${champ.wins}–${champ.losses} across a ${size}-team field.`,
      stats: [
        { label: "Record", value: `${champ.wins}–${champ.losses}` },
        { label: "Points For", value: fmt(champ.pf) },
        { label: "Points Against", value: fmt(champ.pa) },
        ...(finalLine ? [{ label: "Title Game", value: finalLine }] : []),
        ...(runnerUp ? [{ label: "Runner-Up", value: runnerUp.name }] : [])
      ],
      links: [
        { label: `${season.year} Season`, href: `${season.year}.html` },
        { label: `${champ.owner}'s Profile`, href: `alltime.html#owner=${champ.ownerId}` }
      ]
    });
  });

  return items;
}

function hallOfFameExhibits(careers) {
  return Object.values(careers)
    .filter((career) => career.seasons.length)
    .sort((a, b) =>
      b.titles.length - a.titles.length ||
      b.pct - a.pct ||
      b.wins - a.wins
    )
    .map((career) => ({
      id: `hof-${career.ownerId}`,
      kind: "pillar",
      title: career.currentTeam,
      subtitle: career.name,
      owner: career.name,
      ownerId: career.ownerId,
      icon: career.icon,
      color: career.color,
      rings: career.titles.length,
      plate: career.name.toUpperCase(),
      blurb: career.titles.length
        ? `${career.titles.length === 1 ? "A title" : `${career.titles.length} titles`} in ${career.titles.join(", ")}, over ${career.seasons.length} ${career.seasons.length === 1 ? "season" : "seasons"} on record.`
        : `${career.seasons.length} ${career.seasons.length === 1 ? "season" : "seasons"} on record, best finish ${ordinal(career.bestFinish)}.`,
      stats: [
        { label: "Titles", value: career.titles.length ? `${career.titles.length} · ${career.titles.join(", ")}` : "—" },
        { label: "All-Time Record", value: `${career.wins}–${career.losses} (${(career.pct * 100).toFixed(1)}%)` },
        { label: "Playoff Record", value: `${career.playoffWins}–${career.playoffLosses}` },
        { label: "Points For", value: fmt(career.pf) },
        { label: "Points / Game", value: fmt(career.ppg) },
        { label: "Best Finish", value: ordinal(career.bestFinish) },
        ...(career.bestWeek
          ? [{ label: "Best Week", value: `${fmt(career.bestWeek.points)} · W${career.bestWeek.week} ${career.bestWeek.year}` }]
          : []),
        { label: "Seasons", value: career.seasons.map((s) => s.year).join(", ") }
      ],
      links: [{ label: "Full Profile", href: `alltime.html#owner=${career.ownerId}` }]
    }));
}

function recordExhibits(data, careers) {
  const games = flattenGames(data);
  const sides = games.flatMap((row) =>
    row.sides.map((side) => ({ ...side, year: row.year, week: row.week, label: row.label }))
  );
  const seasonTeams = data.seasons.flatMap((season) =>
    Object.values(season.teams).map((team) => ({ ...team, year: season.year, size: Object.keys(season.teams).length }))
  );

  const top = (list, score) => list.reduce((best, item) => (score(item) > score(best) ? item : best));
  const streak = longestStreak(data);
  const veterans = Object.values(careers).filter((career) => career.seasons.length >= 2);

  const bestWeek = top(sides, (s) => s.points);
  const worstWeek = sides.reduce((low, s) => (s.points < low.points ? s : low));
  const bestSeasonPf = top(seasonTeams, (t) => t.pf);
  const bestSeasonRecord = top(seasonTeams, (t) => t.wins - t.losses / 100);
  const blowout = top(games, (g) => g.winScore - g.loseScore);
  const nailBiter = games.reduce((tight, g) => ((g.winScore - g.loseScore) < (tight.winScore - tight.loseScore) ? g : tight));
  const shootout = top(games, (g) => g.winScore + g.loseScore);
  const titleCount = Math.max(...veterans.map((c) => c.titles.length));
  const titleHolders = veterans.filter((c) => c.titles.length === titleCount);
  const mostTitles = titleHolders[0];
  const bestPct = top(veterans, (c) => c.pct);
  const mostPlayoffWins = top(veterans, (c) => c.playoffWins);

  const plaque = (id, label, value, holder, meta, blurb, ownerId, color, icon, stats = []) => ({
    id: `rec-${id}`,
    kind: "plaque",
    title: label,
    subtitle: holder,
    owner: holder,
    ownerId,
    icon,
    color,
    bigValue: value,
    plate: label.toUpperCase(),
    meta,
    blurb,
    stats,
    links: ownerId ? [{ label: `${holder} · Profile`, href: `alltime.html#owner=${ownerId}` }] : []
  });

  return [
    plaque(
      "high-week", "Highest Week", fmt(bestWeek.points), bestWeek.team.name,
      `Week ${bestWeek.week} · ${bestWeek.year}`,
      `${bestWeek.team.owner} hung ${fmt(bestWeek.points)} on ${bestWeek.opponent.name} in week ${bestWeek.week} of ${bestWeek.year}. Nobody has come closer since.`,
      bestWeek.team.ownerId, bestWeek.team.color, bestWeek.team.icon,
      [{ label: "Opponent", value: `${bestWeek.opponent.name} · ${fmt(bestWeek.against)}` }]
    ),
    plaque(
      "season-points", "Most Points, Season", fmt(bestSeasonPf.pf), bestSeasonPf.name,
      `${bestSeasonPf.year} · ${bestSeasonPf.wins}–${bestSeasonPf.losses}`,
      `${bestSeasonPf.owner} scored ${fmt(bestSeasonPf.pf)} across the ${bestSeasonPf.year} regular season — ${fmt(bestSeasonPf.pf / (bestSeasonPf.wins + bestSeasonPf.losses))} a week.`,
      bestSeasonPf.ownerId, bestSeasonPf.color, bestSeasonPf.icon,
      [
        { label: "Finish", value: ordinal(bestSeasonPf.finalRank) },
        { label: "Points Against", value: fmt(bestSeasonPf.pa) }
      ]
    ),
    plaque(
      "best-record", "Best Season Record", `${bestSeasonRecord.wins}–${bestSeasonRecord.losses}`, bestSeasonRecord.name,
      `${bestSeasonRecord.year}`,
      `${bestSeasonRecord.owner} went ${bestSeasonRecord.wins}–${bestSeasonRecord.losses} in ${bestSeasonRecord.year} and finished ${ordinal(bestSeasonRecord.finalRank)}.`,
      bestSeasonRecord.ownerId, bestSeasonRecord.color, bestSeasonRecord.icon,
      [{ label: "Points For", value: fmt(bestSeasonRecord.pf) }]
    ),
    plaque(
      "blowout", "Biggest Blowout", fmt(blowout.winScore - blowout.loseScore), blowout.winner.name,
      `Week ${blowout.week} · ${blowout.year}`,
      `${blowout.winner.name} ${fmt(blowout.winScore)}, ${blowout.loser.name} ${fmt(blowout.loseScore)}. A ${fmt(blowout.winScore - blowout.loseScore)}-point margin in week ${blowout.week} of ${blowout.year}.`,
      blowout.winner.ownerId, blowout.winner.color, blowout.winner.icon,
      [{ label: "Final", value: `${fmt(blowout.winScore)} – ${fmt(blowout.loseScore)}` }]
    ),
    plaque(
      "nail-biter", "Closest Finish", fmt(nailBiter.winScore - nailBiter.loseScore), nailBiter.winner.name,
      `Week ${nailBiter.week} · ${nailBiter.year}${nailBiter.stage === "post" ? ` · ${nailBiter.label}` : ""}`,
      `${nailBiter.winner.name} edged ${nailBiter.loser.name} by ${fmt(nailBiter.winScore - nailBiter.loseScore)} in week ${nailBiter.week} of ${nailBiter.year}.`,
      nailBiter.winner.ownerId, nailBiter.winner.color, nailBiter.winner.icon,
      [{ label: "Final", value: `${fmt(nailBiter.winScore)} – ${fmt(nailBiter.loseScore)}` }]
    ),
    plaque(
      "shootout", "Highest-Scoring Game", fmt(shootout.winScore + shootout.loseScore), `${shootout.winner.name} vs ${shootout.loser.name}`,
      `Week ${shootout.week} · ${shootout.year}`,
      `${fmt(shootout.winScore)} to ${fmt(shootout.loseScore)} — ${fmt(shootout.winScore + shootout.loseScore)} combined points in week ${shootout.week} of ${shootout.year}.`,
      shootout.winner.ownerId, shootout.winner.color, shootout.winner.icon
    ),
    plaque(
      "titles", "Most Championships", String(mostTitles.titles.length), mostTitles.currentTeam,
      titleHolders.map((c) => `${c.name} (${c.titles.join(", ")})`).join(" · "),
      titleHolders.length > 1
        ? `${titleHolders.map((c) => c.name).join(" and ")} are tied at ${titleCount} titles apiece.`
        : `${mostTitles.name} has taken ${mostTitles.titles.length} of the league's titles.`,
      mostTitles.ownerId, mostTitles.color, mostTitles.icon,
      [{ label: "All-Time Record", value: `${mostTitles.wins}–${mostTitles.losses}` }]
    ),
    plaque(
      "win-pct", "Best Win Rate", `${(bestPct.pct * 100).toFixed(1)}%`, bestPct.currentTeam,
      `${bestPct.wins}–${bestPct.losses} all-time`,
      `${bestPct.name} wins ${(bestPct.pct * 100).toFixed(1)}% of the time across ${bestPct.seasons.length} seasons.`,
      bestPct.ownerId, bestPct.color, bestPct.icon,
      [{ label: "Points / Game", value: fmt(bestPct.ppg) }]
    ),
    plaque(
      "playoff-wins", "Most Playoff Wins", String(mostPlayoffWins.playoffWins), mostPlayoffWins.currentTeam,
      `${mostPlayoffWins.playoffWins}–${mostPlayoffWins.playoffLosses} in the bracket`,
      `${mostPlayoffWins.name} has won ${mostPlayoffWins.playoffWins} games once the bracket starts.`,
      mostPlayoffWins.ownerId, mostPlayoffWins.color, mostPlayoffWins.icon
    ),
    ...(streak ? [plaque(
      "streak", "Longest Win Streak", `${streak.run}`, streak.team.name,
      `${streak.year} · weeks ${streak.from}–${streak.to}`,
      `${streak.team.owner} won ${streak.run} straight in ${streak.year}, from week ${streak.from} to week ${streak.to}.`,
      streak.team.ownerId, streak.team.color, streak.team.icon
    )] : []),
    plaque(
      "cold", "Coldest Week", fmt(worstWeek.points), worstWeek.team.name,
      `Week ${worstWeek.week} · ${worstWeek.year}`,
      `${fmt(worstWeek.points)} points. ${worstWeek.opponent.name} put up ${fmt(worstWeek.against)} the same week.`,
      worstWeek.team.ownerId, worstWeek.team.color, worstWeek.team.icon
    )
  ];
}

function cellarExhibits(data) {
  const items = [];
  data.seasons.forEach((season) => {
    const size = Object.keys(season.teams).length;
    const cellar = Object.values(season.teams).find(
      (team) => team.officialLastPlace || team.finalRank === size
    );
    if (!cellar) return;
    items.push({
      id: `cellar-${season.year}`,
      kind: "toilet",
      year: season.year,
      title: String(season.year),
      subtitle: cellar.name,
      owner: cellar.owner,
      ownerId: cellar.ownerId,
      icon: cellar.icon,
      color: cellar.color,
      plate: `${season.year} · LAST PLACE`,
      blurb: `${cellar.owner} finished dead last in ${season.year} at ${cellar.wins}–${cellar.losses}, scoring ${fmt(cellar.pf)} while giving up ${fmt(cellar.pa)}.`,
      stats: [
        { label: "Record", value: `${cellar.wins}–${cellar.losses}` },
        { label: "Points For", value: fmt(cellar.pf) },
        { label: "Points Against", value: fmt(cellar.pa) },
        { label: "Field", value: `${size} teams` }
      ],
      links: [{ label: `${season.year} Season`, href: `${season.year}.html` }]
    });
  });
  return items;
}

export function buildHall(data) {
  const careers = careerTotals(data);
  const years = data.seasons.map((season) => season.year);

  const wings = [
    {
      id: "champions",
      name: "Champions",
      kicker: "The Cup Room",
      accent: "#f2c14a",
      blurb: "Every title the league has handed out.",
      items: championExhibits(data, careers)
    },
    {
      id: "hall",
      name: "Hall of Fame",
      kicker: "The Managers",
      accent: "#8fb6ff",
      blurb: "One pillar per manager, career carved into it.",
      items: hallOfFameExhibits(careers)
    },
    {
      id: "records",
      name: "Record Wall",
      kicker: "The Marks",
      accent: "#7fe0c0",
      blurb: "The numbers nobody has beaten yet.",
      items: recordExhibits(data, careers)
    },
    {
      id: "cellar",
      name: "The Cellar",
      kicker: "Wall of Shame",
      accent: "#d0705a",
      blurb: "Somebody has to finish last.",
      items: cellarExhibits(data)
    }
  ];

  // A flat rail index across every wing: panning never leaves the hall.
  const rail = [];
  wings.forEach((wing, wingIndex) => {
    wing.start = rail.length;
    wing.items.forEach((item, itemIndex) => {
      item.wing = wing.id;
      item.wingName = wing.name;
      item.accent = wing.accent;
      item.wingIndex = wingIndex;
      item.itemIndex = itemIndex;
      item.railIndex = rail.length;
      rail.push(item);
    });
    wing.count = wing.items.length;
  });

  return {
    wings,
    rail,
    careers,
    summary: {
      seasons: data.seasons.length,
      firstYear: Math.min(...years, LOST_SEASON.year),
      lastYear: Math.max(...years),
      managers: Object.keys(data.owners).length,
      titles: wings[0].items.length,
      games: flattenGames(data).length
    }
  };
}

export const helpers = { fmt, fmt0, ordinal };
