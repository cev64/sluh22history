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
   page's playoff picture, so it moves on its own as each week is posted.

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
     null until then, and the board projects one from the season page's
     playoff picture (projectOrder). The first three rounds are keepers, so the worst team
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
    {
      date: "2026-10-14",
      picks: [
        { round: 11, of: "first", to: "jared" },   // Ted's 11th to Jared
        { round: 7, of: "jared", to: "first" },    // Jared's 7th to Ted
      ],
      note: "",
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

  /* The projected order, worst first, from the playoff picture as it
     stands: the four teams missing the playoffs pick 1-4, then the two wild
     cards 5-6, the two division runners-up (2 seeds) 7-8 and the two
     division winners (1 seeds) 9-10. Inside each group, fewest wins and
     then fewest points for picks first. `picture` is the season page's own
     (its buildPicture), so the seeds are always the ones its standings show:
     { week, stats, champs, runnersUp, wildcards, toiletSeeds }. */
  function projectOrder(picture) {
    if (!picture || !picture.week) return null;
    const { stats } = picture;
    const worstFirst = (ids) => [...ids].sort((a, b) => stats[a].wins - stats[b].wins || stats[a].pf - stats[b].pf);
    const order = [
      ...worstFirst(picture.toiletSeeds),
      ...worstFirst(picture.wildcards),
      ...worstFirst(picture.runnersUp.map((r) => r.id)),
      ...worstFirst(picture.champs.map((c) => c.id)),
    ];
    if (order.length !== SHEET_ORDER.length || SHEET_ORDER.some((t) => !order.includes(t))) {
      console.warn("draft-picks.js: the playoff picture doesn't cover every team", order);
      return null;
    }
    return { order, weeks: picture.week, stats };
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
