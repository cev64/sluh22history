# Drafts

One file per ESPN draft, written by `tools/drafts/fetch-draft.py`. The keeper
page (`keepers.html`) reads them to judge who can be kept.

    ESPN_S2=... ESPN_SWID=... python3 tools/drafts/fetch-draft.py --year 2027

A draft never changes once it is made, so each file is fetched once and
committed. Keepers began in 2025, so the files start at 2024 (the draft the
first keepers came from). 2022 has none: that season ran on Sleeper.

Each pick carries ESPN's team id (`team`), which is the franchise and never
changes; `teams` holds the names those ids went by when the file was fetched.
`keepers` is how many keeper rounds open the draft, so the open draft starts
at round `keepers + 1`.

## Next season

After the 2027 draft: fetch `--year 2027`, then set `SEASON = 2027` in
`keepers.js` (shared by the keeper page and the player card's keeper pill). It then judges the 2028 keepers from the 2027 draft and the
2027 box scores.
