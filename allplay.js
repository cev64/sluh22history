/* All-play records and luck, shared by every standings table.

   A team's all-play record pits its score each week against every other
   score posted that week: one win for each team it outscored, one loss for
   each that outscored it, half of each for an exact tie. Its all-play
   winning percentage times the games it actually played is the record its
   scoring has earned ("expected"), and wins minus expected wins is luck.

   Games are { week, a, aScore, b, bScore }, the shape league-data.js uses.
   Regular-season games only: a postseason week has too few teams playing
   to say anything about the field. */
(function () {
  function allPlay(games, { throughWeek = Infinity } = {}) {
    const out = {};
    const line = (id) => (out[id] = out[id] || { wins: 0, losses: 0, ties: 0, apWins: 0, apLosses: 0, apTies: 0 });
    const weeks = {};

    games.forEach((g) => {
      if (g.week > throughWeek) return;
      (weeks[g.week] = weeks[g.week] || []).push([g.a, g.aScore], [g.b, g.bScore]);
      const a = line(g.a), b = line(g.b);
      if (g.aScore > g.bScore) { a.wins += 1; b.losses += 1; }
      else if (g.bScore > g.aScore) { b.wins += 1; a.losses += 1; }
      else { a.ties += 1; b.ties += 1; }
    });

    Object.values(weeks).forEach((scores) => {
      scores.forEach(([id, score], i) => {
        const t = out[id];
        scores.forEach(([, other], j) => {
          if (i === j) return;
          if (score > other) t.apWins += 1;
          else if (score < other) t.apLosses += 1;
          else t.apTies += 1;
        });
      });
    });

    Object.values(out).forEach((t) => finish(t));
    return out;
  }

  // Fills in the derived fields; also used to total several seasons.
  function finish(t) {
    const games = t.wins + t.losses + t.ties;
    const apGames = t.apWins + t.apLosses + t.apTies;
    t.apPct = apGames ? (t.apWins + t.apTies / 2) / apGames : 0;
    t.xWins = t.apPct * games;
    t.luck = t.wins + t.ties / 2 - t.xWins;
    // Rounded to whole games, and the losses are what is left so the
    // expected record always adds up to the games played.
    t.xRecordWins = Math.round(t.xWins);
    t.xRecordLosses = games - t.xRecordWins;
    t.apRecord = `${t.apWins}–${t.apLosses}${t.apTies ? `–${t.apTies}` : ""}`;
    t.xRecord = `${t.xRecordWins}–${t.xRecordLosses}`;
    return t;
  }

  // Several lines (seasons) added into one.
  function combine(lines) {
    const t = { wins: 0, losses: 0, ties: 0, apWins: 0, apLosses: 0, apTies: 0 };
    lines.forEach((l) => { if (l) ["wins", "losses", "ties", "apWins", "apLosses", "apTies"].forEach((k) => { t[k] += l[k]; }); });
    // Luck adds season by season; expected wins too, rather than one
    // career all-play rate stretched over every game.
    t.xWinsSum = lines.reduce((s, l) => s + (l ? l.xWins : 0), 0);
    finish(t);
    t.xWins = t.xWinsSum;
    t.luck = t.wins + t.ties / 2 - t.xWins;
    t.xRecordWins = Math.round(t.xWins);
    t.xRecordLosses = t.wins + t.losses + t.ties - t.xRecordWins;
    t.xRecord = `${t.xRecordWins}–${t.xRecordLosses}`;
    return t;
  }

  // "+1.9" / "−0.9" / "0.0", with a true minus sign like the rest of the site.
  const luckText = (luck) => {
    const v = Math.round(luck * 10) / 10;
    return v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : "0.0";
  };
  const luckClass = (luck) => (Math.round(luck * 10) > 0 ? "positive" : Math.round(luck * 10) < 0 ? "negative" : "");

  // A page's own [week, a, aScore, b, bScore] arrays, in the shared shape.
  const fromTuples = (rows) => rows.map(([week, a, aScore, b, bScore]) => ({ week, a, aScore, b, bScore }));

  window.AllPlay = { allPlay, combine, luckText, luckClass, fromTuples };
})();
