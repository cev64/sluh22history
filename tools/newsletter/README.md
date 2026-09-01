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
| `--box` | JSON of real box scores (see shape below). Overrides the imported file. |
| `--fake` | Fabricate player lines instead. Stamps the PDF as a SAMPLE. |
| `--out` | Output directory. Defaults to the working directory. |

Box scores come from `boxscores/<season>/week-<n>.json` automatically when that
week has been imported (see `boxscores/README.md`), and the sheet then reports
its lines as recorded. Where a week has not been imported, one of `--box` or
`--fake` is required, so a fabricated lineup can never be mistaken for a real
one. Explicit flags win over the imported file: `--box` reads somewhere else,
`--fake` deliberately fabricates.

The printed JSON reports `boxSource` (`imported`, `flag` or `fabricated`) and
`fake`, which now follows what was actually used rather than what was asked
for.

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

Prints JSON with the PDF path, `onePage`, and `published` — the weeks the
output folder now holds, per season. If the content overflows a single sheet
the script warns — trim a section rather than shipping two pages.

### Publishing to the site

The season pages show a **Download PDF** button on a week's Weekly Summary tab
when that week has a newsletter. Build into `newsletters/` and commit the file:

```bash
node tools/newsletter/build.mjs --season 2026 --week 5 --box week5-box.json --out newsletters
git add newsletters && git commit -m "Week 5 newsletter"
```

Alongside the PDF the script rewrites `<out>/index.json`, the list of weeks the
folder actually contains, which is what the pages read. It is rebuilt from the
folder every run rather than appended to, so deleting a PDF and rebuilding
withdraws the button; editing that file by hand is how it goes wrong. The
pages ask for the index once and show nothing if it is missing, so a site with
no newsletters yet simply has no buttons.

The service worker serves same-origin files cache-first and refreshes them in
the background, so a reader who already has the site installed may not see a
brand-new week's button until their next visit.

Only commit newsletters whose `fake` comes back `false` — that is, built from
imported box scores or `--box`. `--fake` fabricates player lines and stamps the
sheet SAMPLE, which is fine for checking layout and not for the league to read.
