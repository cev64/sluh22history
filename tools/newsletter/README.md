# Weekly newsletter

Builds a one-page PDF recap for a season week. Standings, seeding and playoff
odds are read out of the season's own page (`2026.html`, `2025.html`, …) by
`season.mjs`, so the newsletter can never disagree with the website — there is
no second copy of the rules here.

```bash
# real box scores
node tools/newsletter/build.mjs --season 2026 --week 5 --box week5-box.json

# sample with fabricated player lines, for layout review
node tools/newsletter/build.mjs --season 2025 --week 7 --fake
```

| Flag | Meaning |
|---|---|
| `--season` | Season page to read. Needs the week-by-week engine, so 2025 or later. |
| `--week` | Week number. Must already have results posted on the page. |
| `--box` | JSON of real box scores (see shape below). |
| `--fake` | Fabricate player lines instead. Stamps the PDF as a SAMPLE. |
| `--out` | Output directory. Defaults to the working directory. |

One of `--box` or `--fake` is required, so a fabricated lineup can never be
mistaken for a real one.

### Box score shape

```json
{
  "hawaii": {
    "starters": [{ "pos": "QB", "name": "P. Mahomes", "pts": 24.6 }],
    "bench":    [{ "pos": "RB", "name": "T. Pollard", "pts": 18.2 }]
  }
}
```

Starters should be the nine lineup slots (QB, RB, RB, WR, WR, TE, FLEX, FLEX,
D/ST) and ideally sum to the team's posted score. The bench drives the
start/sit section: a bench player is only called out when swapping him for the
worst starter would have flipped the result.

### Output

Prints JSON with the PDF path and `onePage`. If the content overflows a single
sheet the script warns — trim a section rather than shipping two pages.
