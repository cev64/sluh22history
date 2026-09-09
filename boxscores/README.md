# Box scores

Player-level lineups, one file per week:

```
boxscores/<season>/week-<n>.json
boxscores/<season>/index.json      the weeks that exist, rebuilt on every import
```

Two things read these files and nothing else does:

- the season page, which fetches a week only when someone opens a matchup, on
  the weekly Results tab or in the playoff bracket — the files are larger than
  the page itself, so they are never loaded up front
- `tools/newsletter/build.mjs`, which picks the file up automatically and stops
  stamping the sheet SAMPLE

Because both read the same file, a newsletter can never disagree with the box
score a reader can open on the site.

## The weekly export

The league export writes one ESPN-shaped file per week, and it is the only
source the site needs for a week: it carries the five matchups, both scores,
both starting lineups and the team names as they stood that week. `week.mjs`
posts the scores from it and `import.mjs` turns the same file into the box
scores, so the score on the page and the box score behind it cannot come from
different places.

Files reach the repo as plain JSON, as base64 (which is what Google Drive's
download returns), or inside Drive's `{ content, ... }` envelope. `raw.mjs`
reads all three, so nothing has to be decoded first.

`tools/boxscores/fetch-week.py` pulls one week straight from ESPN and writes it
in that shape. Set `WEEK`, `YEAR` and `LEAGUE_ID` at the top of the file and run
it with no arguments; it refuses to write a week that still scores zeroes, so a
half-played week cannot reach the site. ESPN needs a logged-in session, and this
repository is public, so the cookies live in an untracked
`tools/boxscores/espn-cookies.json` — see the header of that script.

`tools/boxscores/WEEKLY-TASK.md` is the scheduled job that drives both tools.

## Posting a week

```bash
node tools/boxscores/week.mjs --season 2026 --in /path/to/raw
node tools/boxscores/week.mjs --season 2026 --in /path/to/raw --write
node tools/boxscores/week.mjs --season 2026 --in /path/to/raw --write --apply-renames
```

Without `--write` it reports and touches nothing: the `results` line it would
post, every game with its margin, the high and low, and any team whose name in
the export no longer matches the page. With `--write` it edits `results` in
`<season>.html` — weeks already posted come out byte for byte unchanged — and
then re-reads the page to report the standings either side of the new week, the
playoff field, who moved in and out of it, and the Toilet Bowl order.

Nothing is written unless the week's ten teams and five pairings match
`schedule[week]` and every team's starters sum to its posted score. A pairing
that disagrees with the schedule is either a bad export or a real schedule
change, and guessing between them corrupts every standing computed from it.

Team names are reported but only changed with `--apply-renames`, which edits all
three places a current name lives: `teams` on the season page,
`owners.<ownerId>.currentTeam` in `league-data.js`, and `CACHE_VERSION` in
`sw.js` — league-data.js is served cache-first, so without the bump a returning
visitor keeps the old name on the trophy room's locker flag.

## Importing

Point the importer at the same folder:

```bash
node tools/boxscores/import.mjs --season 2025 --in /path/to/raw
node tools/boxscores/import.mjs --season 2026 --in /path/to/raw --week 5
```

Nothing is written unless every week validates against the season page: the
same pairings, the same scores, and every team's starters summing to its posted
score. A box score that disagrees with the standings is a bad import, not a new
fact, so the run fails whole rather than writing part of it. Run after
`week.mjs --write` and that check doubles as an audit of what it posted.

Regular-season weeks are checked against `results`, playoff weeks against
`postseason` — the block the bracket is drawn from. The page does not record
every playoff game: it carries the nine the bracket shows, while the export
also has the consolation games nobody displays. Those extra games are still
imported, but nothing on the page can vouch for them, so the run reports
`gamesCheckedAgainstPage` and `gamesCheckedOnlyBySum` separately rather than
implying they were all verified the same way.

## Two things about the raw data

**`position` is shifted by one.** Every player in a TE lineup slot reports
position `WR`, every WR reports `RB/WR`, every QB reports `TQB`. Colouring
anything by the raw field labels every tight end a receiver. The importer
translates it and then checks the translation against the slot each starter
actually started in, so if the export ever changes shape the import fails
instead of quietly mislabelling a thousand players.

**Teams are keyed by ESPN id, not name.** Team names change mid-season; the
`ESPN_TEAM` table in the importer maps id to this repo's permanent team id, and
nothing anywhere keys off a name.

## Shape

```json
{ "season": 2025, "week": 1,
  "games": [
    { "home": "game", "away": "first", "homeScore": 124.78, "awayScore": 89.72,
      "lineups": {
        "game": [
          { "name": "Jalen Hurts", "pos": "QB", "nfl": "PHI", "slot": "QB",
            "pts": 24.28, "proj": 23.43, "starter": true, "injury": null }
        ]
      } } ] }
```

`slot` is where the player actually lined up (`QB`, `RB`, `WR`, `TE`, `FLEX`,
`D/ST`, `BE`, `IR`); `pos` is what he is. Injured reserve is kept distinct from
the bench on purpose — an IR player could not have been started, so counting him
as a bench call would invent a manager's mistake that was never available.
