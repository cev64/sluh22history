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

   After the draft, move DRAFT on a year and empty TRADES. */
(function () {
  const DRAFT = 2027;
  const SEASON = DRAFT - 1;   // the season whose page names the teams
  const ROUNDS = 15;
  const KEEPER_ROUNDS = 3;    // keepers.js: they fill the first rounds

  /* The board's columns, left to right, until the draft order is set: the
     order of the league's own pick sheet. Each column is the team holding
     the picks in it. */
  const SHEET_ORDER = ["hawaii", "left", "laporta", "kareem", "jared", "hamilton", "first", "infinity", "game", "roll"];

  /* The draft order once it is known, the team picking first first; null
     until then. Set, it becomes the board's columns and every pick gets its
     number. The draft snakes: odd rounds run 1 to 10, even rounds 10 to 1,
     and a traded pick keeps the slot of the team it came from. */
  const ORDER = null;

  const TEAMS = ORDER || SHEET_ORDER;

  const TRADES = [
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

  /* A pick's place in the draft: { inRound, overall, label: "6.04" }, or
     null while the order isn't set. */
  function pickNo(round, of) {
    if (!ORDER) return null;
    const slot = ORDER.indexOf(of);
    if (slot < 0) return null;
    const n = ORDER.length;
    const inRound = round % 2 ? slot + 1 : n - slot;
    return { inRound, overall: (round - 1) * n + inRound, label: `${round}.${String(inRound).padStart(2, "0")}` };
  }

  /* The trades played in order. `owner` maps "round:of" to the team holding
     that pick; each trade comes back with every move's `from` filled in. A
     move naming a pick that doesn't exist is skipped and logged, so one typo
     can't take the board down. */
  function book() {
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
      // In the order they come up in the round, which is the snake's order
      // once there is one (and the sheet's until then).
      const at = (of) => (ORDER ? pickNo(r, of).inRound : TEAMS.indexOf(of));
      for (const t of TEAMS) held[t][r].picks.sort((a, b) => at(a) - at(b));
    }
    return { owner, held, trades };
  }

  window.DraftPicks = { DRAFT, SEASON, ROUNDS, KEEPER_ROUNDS, TEAMS, ORDER, TIERS, tier, pickNo, book };
})();
