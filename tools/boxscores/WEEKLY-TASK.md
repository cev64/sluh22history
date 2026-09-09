# The weekly task

The prompt below is the scheduled Tuesday job: post the newest week of results
to the live season page. It replaces an older version that read the scores off a
screenshot of the league's results page. Nothing has to be uploaded now — the
league's own weekly export carries the matchups, the scores and the current team
names, and `tools/boxscores/week.mjs` posts from it.

Getting the week into Drive is the one step still done by hand:

```bash
python3 fetch-week.py           # just this week
python3 fetch-week.py --all     # re-pull weeks 1..WEEK, after an ESPN correction
```

then upload the `week_NN.json` file(s) it writes to the `weekly_box` folder.
Everything after that is the prompt below.

The task passes every week in the folder through on every run, so an uploaded
correction to an old week reaches the site by itself. What it cannot do is
notice a correction ESPN made but Drive never heard about — that is what `--all`
is for.

The prompt lives here so it is versioned next to the tools it drives. Editing one
without the other is how the two drift apart.

---

Post the newest week of SLUH '22 fantasy football results to the league site.

REPO: cev64/sluh22history — edit `2026.html`. Nothing else, EXCEPT on a team
rename, which also touches `league-data.js` and `sw.js` — the tool handles all
three, see Step 3.

DRIVE: the league's weekly exports are in Google Drive folder ID
`1f3SBA28xP6DQ7VYkeH8_m8on-X3bh-8n`
(SLUH FFL folder → screenshot_data → 2026 → weekly_box).
Files are named for their week: `week_01.json`, `week_02.json`, and so on. Each
one holds every matchup, both scores, both starting lineups, and the team names
as they stood that week. There is no screenshot to read and no score to
transcribe by hand.

HOW THE PAGE WORKS — read this before editing.

`2026.html` is a live-season hub. A week rail across the top (Week 0 through
Week 14, a dropdown on phones) picks a week; each week has four tabs:
Results, Standings, Playoff Picture, Weekly Summary.

There are three blocks of data. Everything else on the page is COMPUTED from
them and updates itself:
  - `teams`             franchise identity     <- the tool edits this on a rename
  - `results`           weekly scores          <- the tool writes this
  - `weeklySummaries`   the written recap      <- YOUR edit, the only one

Computed automatically, DO NOT hand-edit and DO NOT touch the engine:
records, points for/against, games back, division order with the full
rulebook tiebreakers, wild cards, clinch and elimination badges, the
tiebreak explanations behind the info dots, the projected bracket, Toilet
Bowl seeding, and the "Storylines" panel in the header.

The finished 2025 season (`2025.html`) is the reference for what a
completed week looks like. Match it.

NEWSLETTERS — this task no longer builds them. Some earlier weeks still have a
file in `newsletters/` and will keep showing a "Download PDF" card on their
Weekly Summary tab; that is expected, not a bug. Leave `newsletters/`,
`newsletters/index.json` and `tools/newsletter/` alone — do not build a sheet
for the new week, and do not remove the old ones.

STEP 1 — FETCH THE EXPORTS
Branch from the latest `main` (never reuse an old branch — earlier PRs are
merged). List the Drive folder and download every `week_NN.json` into one
scratch directory. Drive hands them back base64-encoded inside a JSON envelope;
save whatever you get, the tools read the raw JSON, the base64 and the envelope
alike, so no decoding step is needed. Do not rename the files.

Download EVERY week, not just the newest. The tools pass the whole season
through on each run: a week already posted with the same scores is left exactly
as it is, and a week whose scores have MOVED — ESPN restates a stat days later —
is corrected. Skipping the old weeks is how a correction gets missed.

If nothing is new and nothing has changed, STOP: change nothing, open no PR,
report "no new results". Never invent scores for a week whose export is not
there.

STEP 2 — READ THE WEEK
    node tools/boxscores/week.mjs --season 2026 --in <scratch dir>

This reads every export and sorts the weeks into three piles — new, corrected,
and already matching — then prints what it would post: the exact `results` line,
each game with its margin, the high and low scores, the closest and biggest
wins, and any team whose name in the export differs from the page. A corrected
week also prints what each moved game used to say and what it says now. It
writes nothing.

It refuses the whole run, writing nothing, if a week's ten teams and five
pairings do not match `schedule[week]`, or if any team's starters do not sum to
its posted score. A pairing that disagrees with the schedule is either a bad
export or a real schedule change — STOP and report it rather than guessing,
because guessing corrupts every downstream standing.

Read the output before going on. If several weeks are missing it handles them
all in one pass, in order.

STEP 3 — POST IT
    node tools/boxscores/week.mjs --season 2026 --in <scratch dir> --write

Add `--apply-renames` if Step 2 reported a rename. Owners are permanent; team
NAMES change mid-season, and a current name lives in two places that must not
drift apart: `teams` in `2026.html`, and `owners.<ownerId>.currentTeam` in
`league-data.js`. `currentTeam` is the present-day name rendered by the record
book (`alltime.html`) and the 3D trophy room (`trophy.html`): the Hall of Fame
nameplates, the Most Championships and Cellar plaques, and the flag and wordmark
on that team's Team Locker. Leaving it stale means the new name shows on
2026.html while the old one shows on that team's own locker flag.
`league-data.js` is served cache-first by the service worker, so `--apply-renames`
also bumps `CACHE_VERSION` in `sw.js` — without that, returning visitors keep the
old name. (2026.html itself is a navigation and is network-first, so ordinary
weekly results need no bump.)

Never change an ID, owner, division, icon, or color, and never touch the
`seasons` array in `league-data.js` — those are finished seasons and the trophy
room is built from them.

Weeks that already match are left byte for byte alone; a new or corrected week
is the only line that moves.

After writing, the tool re-reads the page and reports the standings on either
side of the newest week: division order with each team's movement, the six-team
playoff field, who moved in and out of it, the first team out, and the Toilet
Bowl order. Both columns are computed from the page as it stands after any
correction, so they already account for it. That is the material for Step 5 —
you do not need to work out what changed by hand.

STEP 4 — IMPORT THE BOX SCORES
    node tools/boxscores/import.mjs --season 2026 --in <scratch dir>

This turns the same exports into the player-level box scores behind each
matchup's "Box score" button. It re-checks every game against the scores now on
the page, so it also serves as an independent audit that Step 3 wrote the week
correctly. It refuses the whole run rather than writing part of it.

STEP 5 — WRITE THE RECAP
This is the only part you write. Add to `weeklySummaries` in `2026.html`, keyed
by the same week number. Weeks use BULLETS (the preseason entry at key 0 uses
`body` paragraphs — leave it alone):

  4: {
    headline: "One line, the week's story.",
    bullets: [
      "<strong>Team Name</strong> did the thing, 142.10–98.34.",
      "Another bullet."
    ],
    generated: "Week 4 recap"
  },

Four or five bullets, one line each, concise and punchy. Bold team names
with <strong>. Write from the numbers Steps 2 and 3 printed: who won and by how
much, the high and low scores, a blowout or a nailbiter, and anything that moved
the division races, the playoff cut line, or the Toilet Bowl order. Never predict
a champion or a last place; the season is live and the page deliberately shows
no final results.

CORRECTIONS: write a recap only for weeks that are NEW. If Step 2 reported a
correction to a week already on the site, leave that week's existing recap
alone unless the correction changed who won — then fix the sentences the new
score contradicts, and nothing else. Say in your report which recaps you
touched.

STEP 6 — VERIFY
- Extract the <script> block and run `node --check` on it.
- Serve the repo and load 2026.html at the new week in a browser. Confirm no
  console errors, and that Results, Standings, Playoff Picture, and Weekly
  Summary all render. Check the page at 390px wide too.
- Open a matchup's box score and confirm the lineups load.
- Open a tiebreak info dot if any appear, and confirm it reads sensibly.
- ONLY if a rename was applied: also load `trophy.html`. Confirm the hall opens
  with no console errors, and that the renamed team reads correctly on its Hall
  of Fame nameplate and on its Team Locker flag.

The game-count sanity check is automatic — Step 3 fails if any team's game count
does not equal the number of weeks posted.

STEP 7 — SHIP
Commit naming the weeks added and any weeks corrected, push, and open a PR.
Report the weeks you added, the scores the tool read, any corrections (the old
score and the new one, and whether a result flipped), and any team renames
(naming every file changed for the rename).
