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

## Importing

The league export writes one ESPN-shaped file per week. Point the importer at
the folder holding them:

```bash
node tools/boxscores/import.mjs --season 2025 --in /path/to/raw
node tools/boxscores/import.mjs --season 2026 --in /path/to/raw --week 5
```

Nothing is written unless every week validates against the season page: the
same pairings, the same scores, and every team's starters summing to its posted
score. A box score that disagrees with the standings is a bad import, not a new
fact, so the run fails whole rather than writing part of it.

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
