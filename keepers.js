/* Keepers: who each team can carry into next season. Shared by the keeper
   page (keepers.html) and the player card (player-card.js), which wears a
   keeper pill for anyone on a roster right now. Plain script, not a module,
   so it works from file:// like league-data.js.

   The league's rules, as the commissioner states them:
     1. A team keeps up to `keepers` players (the draft's own setting).
        Keepers are "drafted" into the first rounds of the next draft, so
        the open draft starts the round after them.
     2. A player taken in the first two OPEN rounds cannot be kept the next
        year — rounds 1–2 of a draft with no keepers (2024), rounds 4–5 once
        three keeper rounds come first (2025 on).
     3. Three straight years is the limit: drafted (or picked up), kept,
        kept again, then he goes back into the draft. The count follows the
        player, not the team — a keeper traded away and kept by his new team
        is still on the same clock.

   Everything is read, nothing is typed in by hand:
     drafts/<year>.json      each draft, from tools/drafts/fetch-draft.py
     boxscores/<season>/     the weekly box scores; the newest week's lineups
                             (bench included) are the rosters

   So it follows the season on its own: every week posted moves the rosters.
   Next year, move SEASON on once that season's draft file is in drafts/. */
(function () {
  const SEASON = 2026;
  const KEEP_YEAR = SEASON + 1;

  /* ESPN's team id -> this site's team id, present day. The same table as
     ESPN_TEAM in tools/boxscores/raw.mjs; ESPN ids are the franchise, so a
     draft's `team` can be matched to a roster whatever either was named. */
  const ESPN_TEAM = {
    1: "game", 2: "kareem", 3: "hawaii", 4: "infinity", 5: "left",
    6: "hamilton", 7: "jared", 8: "laporta", 9: "roll", 11: "first",
  };

  const yy = (y) => `’${String(y).slice(2)}`;
  const getJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: ${r.status}`))));

  /* The three drafts the rules can reach back to, keyed by season. */
  let draftsPromise = null;
  function loadDrafts() {
    if (!draftsPromise) {
      draftsPromise = Promise.all([SEASON - 2, SEASON - 1, SEASON].map((y) => getJSON(`drafts/${y}.json`).catch(() => null)))
        .then((list) => {
          const drafts = {};
          list.forEach((d) => {
            if (!d) return;
            d.byName = new Map(d.picks.map((p) => [p.player, p]));
            drafts[d.season] = d;
          });
          if (!drafts[SEASON]) throw new Error(`drafts/${SEASON}.json is missing`);
          return drafts;
        });
    }
    return draftsPromise;
  }

  /* Each team's roster as of the newest week it played, every player on it
     (bench and IR too). `full` reads every week, for each player's season
     points; without it, only as many of the newest weeks as it takes to find
     every team (one, outside a playoff bye) — all a card's pill needs. */
  async function loadRosters({ full = false } = {}) {
    const weeks = await getJSON(`boxscores/${SEASON}/index.json`).catch(() => []);
    const rosters = {}, asOf = {}, points = {};
    const read = (box) => {
      for (const game of box.games) {
        for (const [teamId, lineup] of Object.entries(game.lineups)) {
          if (full || !rosters[teamId]) { rosters[teamId] = lineup; asOf[teamId] = box.week; }
          for (const p of lineup) points[p.name] = (points[p.name] || 0) + (p.pts || 0);
        }
      }
    };
    const ordered = [...weeks].sort((a, b) => a - b);
    if (full) {
      const boxes = await Promise.all(ordered.map((w) => getJSON(`boxscores/${SEASON}/week-${w}.json`)));
      boxes.forEach(read);
    } else {
      const teams = Object.keys(ESPN_TEAM).length;
      for (const w of ordered.reverse()) {
        read(await getJSON(`boxscores/${SEASON}/week-${w}.json`));
        if (Object.keys(rosters).length >= teams) break;
      }
    }
    return { weeks, latest: weeks.length ? Math.max(...weeks) : 0, rosters, asOf, points: full ? points : null };
  }

  /* One player's verdict: `level` is "in", "last" (one more year) or "out";
     `tag` says why; `history` traces how he got here, year by year. */
  function judge(name, drafts) {
    const at = (year) => drafts[year] && drafts[year].byName.get(name);
    const kept = (year) => { const p = at(year); return !!(p && p.keeper); };

    // Back through the years he has been kept, to how he first arrived.
    let first = SEASON;
    while (kept(first) && drafts[first - 1]) first--;
    const history = [];
    for (let y = first; y <= SEASON; y++) {
      const p = at(y);
      if (!drafts[y]) continue;
      if (p && p.keeper) {
        history.push({ cls: "kept", text: `${yy(y)} Kept`, team: p.team, year: y });
      } else if (p) {
        const open = p.round - drafts[y].keepers;
        history.push({ cls: open <= 2 ? "early" : "", text: `${yy(y)} Rd ${p.round}`, team: p.team, year: y });
      } else {
        history.push({ cls: "", text: `${yy(y)} Pickup` });
      }
    }

    const d = at(SEASON);
    if (kept(SEASON) && kept(SEASON - 1)) return { level: "out", out: true, tag: "3-year limit", history };
    if (d && !d.keeper && d.round - drafts[SEASON].keepers <= 2) {
      return { level: "out", out: true, tag: `Round ${d.round} pick`, history };
    }
    if (kept(SEASON)) return { level: "last", last: true, tag: "Final year", history };
    return { level: "in", tag: "Eligible", history };
  }

  /* Rostered player name -> verdict. Players on no roster have none: whether
     a free agent could be kept is not a question anyone is asking. */
  let statusMap = null;
  let statusPromise = null;
  function buildStatuses(drafts, rosters) {
    const map = new Map();
    for (const lineup of Object.values(rosters)) for (const p of lineup) map.set(p.name, judge(p.name, drafts));
    statusMap = map;
    return map;
  }
  function statuses() {
    if (!statusPromise) {
      statusPromise = Promise.all([loadDrafts(), loadRosters()])
        .then(([drafts, r]) => buildStatuses(drafts, r.rosters))
        .catch(() => new Map());
    }
    return statusPromise;
  }

  /* Everything the keeper page draws from; it also primes the card's pills,
     so a card opened there needs nothing more. */
  function load() {
    return Promise.all([loadDrafts(), loadRosters({ full: true })]).then(([drafts, r]) => {
      buildStatuses(drafts, r.rosters);
      statusPromise = Promise.resolve(statusMap);
      return { drafts, ...r };
    });
  }

  window.Keepers = {
    SEASON, KEEP_YEAR, ESPN_TEAM, judge, load, statuses,
    /* The verdict now, if the rosters are already in; null otherwise. */
    statusNow: (name) => (statusMap ? statusMap.get(name) || null : undefined),
  };
})();
