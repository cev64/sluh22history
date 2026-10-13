/* Draft picks: who owns every pick in the next draft. ESPN can't trade
   draft picks, so the league keeps the book here and the draft page
   (draft.html) draws it. Plain script, not a module, so it works from
   file:// like league-data.js and keepers.js.

   Every team starts with its own pick in every round. A trade moves picks
   from one team to another; the board is those trades played in order, so
   nothing else is ever edited by hand.

   To post a trade, add it to TRADES (oldest first). A pick is named by its
   round and the team it ORIGINALLY belonged to (`of`), whoever holds it
   now; `to` is the team that receives it. Team ids are the season page's:
     first, game, hamilton, roll, infinity, hawaii, left, kareem, laporta, jared

     {
       date: "2026-11-02",
       picks: [
         { round: 6, of: "hawaii", to: "hamilton" },     // Matt's 6th to Niko
         { round: 14, of: "hamilton", to: "hawaii" },    // Niko's 14th to Matt
       ],
       note: "Josh Jacobs went to Hamilton in the same deal.",
     },

   Until ORDER is set, the board projects the draft order from the season
   page's standings, so it moves on its own as each week is posted.

   After the draft, move DRAFT on a year, empty TRADES and reset ORDER. */
(function () {
  const DRAFT = 2027;
  const SEASON = DRAFT - 1;   // the season whose page names the teams
  const ROUNDS = 15;
  const KEEPER_ROUNDS = 3;    // keepers.js: they fill the first rounds

  /* The board's columns, left to right, before a game has been played:
     the order of the league's own pick sheet. */
  const SHEET_ORDER = ["hawaii", "left", "laporta", "kareem", "jared", "hamilton", "first", "infinity", "game", "roll"];

  /* Each manager's initials, as the sheet wrote them. */
  const INITIALS = {
    hawaii: "MW", left: "NR", laporta: "GT", kareem: "MK", jared: "JT",
    hamilton: "NN", first: "TW", infinity: "IF", game: "CV", roll: "JP",
  };

  /* The draft order once it is official, the team picking first first;
     null until then, and the board projects one from the standings
     (projectOrder). The first three rounds are keepers, so the worst team
     makes the first real pick, 4.01; rounds 1-3 run in round 4's order and
     hold the keepers. From round 4 the draft snakes: round 5 runs back from
     10 to 1, round 6 forward again. A traded pick keeps the slot of the team
     it came from. */
  const ORDER = null;

  const TRADES = [
    {
      date: "2026-10-13",
      picks: [
        { round: 15, of: "hawaii", to: "game" },   // Matt's 15th to Charlie
        { round: 6, of: "game", to: "hawaii" },    // Charlie's 6th to Matt
      ],
      note: "Jalen Coker went to Charlie in the same deal.",
    },
  ];

  /* Rounds by what a player taken in them means for keeping him: the keeper
     rounds, the two open rounds whose players can't be kept the next year
     (keepers.js, rule 2), and the rest. */
  function tier(round) {
    if (round <= KEEPER_ROUNDS) return "keeper";
    if (round <= KEEPER_ROUNDS + 2) return "early";
    return "open";
  }
  const TIERS = [
    { id: "keeper", from: 1, to: KEEPER_ROUNDS },
    { id: "early", from: KEEPER_ROUNDS + 1, to: KEEPER_ROUNDS + 2 },
    { id: "open", from: KEEPER_ROUNDS + 3, to: ROUNDS },
  ];

  /* The projected order: the regular-season standings so far, worst
     first. Fewest wins (a tie is half a win), then fewest points for.
     `results` is the season page's: week -> [[teamA, scoreA, teamB, scoreB]]. */
  function projectOrder(results) {
    const line = {};
    for (const t of SHEET_ORDER) line[t] = { wins: 0, losses: 0, ties: 0, pf: 0 };
    let weeks = 0;
    for (const games of Object.values(results || {})) {
      if (!games || !games.length) continue;
      weeks++;
      for (const [a, as, b, bs] of games) {
        if (!line[a] || !line[b]) continue;
        line[a].pf += as; line[b].pf += bs;
        if (as > bs) { line[a].wins++; line[b].losses++; }
        else if (bs > as) { line[b].wins++; line[a].losses++; }
        else { line[a].ties++; line[b].ties++; }
      }
    }
    if (!weeks) return null;
    const won = (t) => line[t].wins + line[t].ties / 2;
    const order = [...SHEET_ORDER].sort((x, y) => won(x) - won(y) || line[x].pf - line[y].pf);
    return { order, weeks, line };
  }

  /* Does this round run 1 to 10 (else 10 to 1)? Round 4 and the keeper
     rounds before it run forward, then it snakes. */
  const SNAKE_FROM = KEEPER_ROUNDS + 1;
  const forward = (round) => round <= SNAKE_FROM || (round - SNAKE_FROM) % 2 === 0;

  /* A pick's place in the draft, { inRound, label: "4.01" }, in the given
     order (the official one or a projection). The keeper rounds get no
     number: those picks only hold the keepers. */
  function pickNo(round, of, order) {
    if (!order || round <= KEEPER_ROUNDS) return null;
    const slot = order.indexOf(of);
    if (slot < 0) return null;
    const inRound = forward(round) ? slot + 1 : order.length - slot;
    return { inRound, label: `${round}.${String(inRound).padStart(2, "0")}` };
  }

  /* The trades played in order. `owner` maps "round:of" to the team holding
     that pick; each trade comes back with every move's `from` filled in. A
     move naming a pick that doesn't exist is skipped and logged, so one typo
     can't take the board down. */
  function book(order) {
    const TEAMS = order || SHEET_ORDER;
    const owner = new Map();
    for (let r = 1; r <= ROUNDS; r++) for (const t of TEAMS) owner.set(`${r}:${t}`, t);
    const trades = TRADES.map((trade, i) => {
      const moves = [];
      for (const m of trade.picks || []) {
        const key = `${m.round}:${m.of}`;
        if (!owner.has(key) || !TEAMS.includes(m.to)) {
          console.warn(`draft-picks.js: trade ${i + 1} names a pick or team that doesn't exist`, m);
          continue;
        }
        moves.push({ round: m.round, of: m.of, from: owner.get(key), to: m.to });
        owner.set(key, m.to);
      }
      return { date: trade.date || "", note: trade.note || "", moves, index: i + 1 };
    });

    /* Team -> round -> the picks it holds there (by original team, its own
       first) and the ones it started with but has traded away. */
    const held = {};
    for (const t of TEAMS) held[t] = {};
    for (let r = 1; r <= ROUNDS; r++) {
      for (const t of TEAMS) held[t][r] = { picks: [], gone: [] };
      for (const of of TEAMS) {
        const to = owner.get(`${r}:${of}`);
        held[to][r].picks.push(of);
        if (to !== of) held[of][r].gone.push(to);
      }
      // In the order they come up in the round: the snake's, once there is
      // an order (the sheet's until then).
      const at = (of) => (order ? (forward(r) ? 1 : -1) * order.indexOf(of) : TEAMS.indexOf(of));
      for (const t of TEAMS) held[t][r].picks.sort((a, b) => at(a) - at(b));
    }
    return { teams: TEAMS, owner, held, trades };
  }

  window.DraftPicks = { DRAFT, SEASON, ROUNDS, KEEPER_ROUNDS, SHEET_ORDER, INITIALS, ORDER, TIERS, tier, forward, projectOrder, pickNo, book };
})();
