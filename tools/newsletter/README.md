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

It also reports `panelBullets` (how many printed) and `panelTrimmed` (the ones
dropped to make the page fit).

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
start/sit section: a bench player is only called out when a **legal** swap
would have flipped the result. The two flex spots take a running back, receiver
or tight end, but a quarterback can only replace a quarterback and a defence
only a defence — so the section reports the best swing across every eligible
pairing, not the biggest gap on the roster. Comparing the best bench player
against the worst starter outright suggests things like starting a quarterback
over a defence, which was never a choice the manager had.

### The Panel

The bottom third of the sheet is a talk-show band: three columns of short
bullets — **Cold Open** (this week), **The Callback** (league history) and
**By the Numbers**.

`history.mjs` reads `teams`, `regularGames`, `postseason` and `finalOrder` out
of every archive season page and keys everything by **owner**. Team ids are
reassigned between seasons — `packers` and `metcalf` come and go, and Charlie
alone has been `oneen`, `olave`, `saint` and `game` — so an id means nothing
across years. It pulls the blocks out by scanning matched delimiters rather
than by a closing-brace regex, because the archive pages are hand-maintained
and not uniformly indented.

`panel.mjs` offers around two dozen candidate bullets and returns only the ones
the numbers support. Nothing is predicted and nothing is invented: a generator
that cannot compute its claim returns nothing rather than hedging, so a quiet
week simply gets a shorter panel. **"All-time" includes this season's earlier
weeks**, not just the archives — a record claim that ignored weeks 1–6 of the
season it is printed in would be wrong. No franchise gets more than two bullets
in the body; a third is demoted to a reserve that prints last and a fourth is
dropped. Redundant pairs are suppressed: a winless team does not also get its
losing streak as a separate bullet, and a week that broke the all-time record
does not also get "that is his career best".

Career win-loss lines are **regular season only**, matching every other record
this league quotes; best and worst single weeks do count playoff games, because
a playoff week is still a week someone scored in.

**Auto-fit.** The panel is the sheet's shock absorber. Everything above it is
fixed by the week itself, so `build.mjs` renders every bullet, measures the
page, and drops the least important bullet from the *tallest* column until the
page fits — the band is as tall as its tallest column, so shedding from a short
one changes nothing. A column that empties is removed, and if every column
empties the whole panel goes rather than half-rendering.

Two things make that measurement trustworthy. The page is measured at the width
the sheet actually prints at (7.66in), because a default 1280px viewport wraps
the text far less and will report a page that fits while the PDF quietly runs
onto a second sheet. And `NEWSLETTER_PAGE_PX` overrides the page height, which
is how to exercise the trim loop deliberately:

```bash
NEWSLETTER_PAGE_PX=820 node tools/newsletter/build.mjs --season 2025 --week 3 --out /tmp/nl
```

A season with no archive behind it gets no panel at all.

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
