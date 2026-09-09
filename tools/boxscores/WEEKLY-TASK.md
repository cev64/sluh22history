# The weekly task

The prompt below is the scheduled Tuesday job: post the newest week of results
to the live season page. It replaces an older version that read the scores off a
screenshot of the league's results page. Nothing has to be uploaded now — the
league's own weekly export carries the matchups, the scores and the current team
names, and `tools/boxscores/week.mjs` posts from it.

Getting the season into Drive is the one step still done by hand:

```bash
python3 fetch-season.py
```

There is no week to set. It walks the season and stops at the first week that
has not finished, then writes ONE file, `season_2026.json`, holding every
completed week. Upload it to the `weekly_box` folder, replacing the copy already
there. Everything after that is the prompt below.

That one file is the whole truth. The task rebuilds `results` from it every
run, so a stat ESPN restated in an old week is simply carried along and fixed —
there is nothing to notice and nothing to decide.

The prompt lives here so it is versioned next to the tools it drives. Editing one
without the other is how the two drift apart.

---

Post the newest week of SLUH '22 fantasy football results to the league site.

REPO: cev64/sluh22history — edit `2026.html`. Nothing else, EXCEPT on a team
rename, which also touches `league-data.js` and `sw.js` — the tool handles all
three, see Step 3.

DRIVE: the league's export is one file in Google Drive folder ID
`1f3SBA28xP6DQ7VYkeH8_m8on-X3bh-8n`
(SLUH FFL folder → screenshot_data → 2026 → weekly_box), named `season_2026.json`.
It holds every completed week of the season: each matchup, both scores, both
starting lineups, and the team names as they stood. It is the authority — the
site is rebuilt from it, not merged into. There is no screenshot to read and no
score to transcribe by hand.

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

STEP 1 — FETCH THE EXPORT
Branch from the latest `main` (never reuse an old branch — earlier PRs are
merged). Download `season_2026.json` from the Drive folder to a scratch path.

It is a large file — a whole season of lineups — so Drive will hand it back
base64-encoded inside a JSON envelope, and probably spill it to a file rather
than returning it inline. Save whatever you get and point the tools at it; they
read raw JSON, base64 and the envelope alike, so no decoding step is needed. Do
NOT try to read the contents yourself — the tools do that.

If the folder has no `season_2026.json` at all, STOP: change nothing, open no
PR, report that the export is missing. Never invent scores.

STEP 2 — READ IT
    node tools/boxscores/week.mjs --season 2026 --in <the downloaded file>

This reads every week in the export and prints what it would post: the exact
`results` line, and for any week that is NEW to the page, each game with its
margin, the high and low scores, and the closest and biggest wins — the recap
material. It also prints any team whose name in the export differs from the
page. It writes nothing.

Every week in the export gets written, whether or not it is already on the
page. That is the point: the site is made to match the file. You do not need to
work out which weeks changed, and you should not report on it.

It refuses the whole run, writing nothing, if a week's ten teams and five
pairings do not match `schedule[week]`, or if any team's starters do not sum to
its posted score. A pairing that disagrees with the schedule is either a bad
export or a real schedule change — STOP and report it rather than guessing,
because guessing corrupts every downstream standing.

Read the output before going on. If several weeks are missing it handles them
all in one pass, in order.

STEP 3 — POST IT
    node tools/boxscores/week.mjs --season 2026 --in <the downloaded file> --write

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

A week on the page that the export does not carry is left alone rather than
deleted — a short export is a bad download, not an instruction to remove a month
of the season. The tool says so if it happens; if it does, the download is
suspect, so STOP and report it rather than committing.

After writing, the tool re-reads the page and reports the standings on either
side of the newest week: division order with each team's movement, the six-team
playoff field, who moved in and out of it, the first team out, and the Toilet
Bowl order. That is the material for Step 5 — you do not need to work out what
changed by hand.

STEP 4 — IMPORT THE BOX SCORES
    node tools/boxscores/import.mjs --season 2026 --in <the downloaded file>

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

Write a recap ONLY for the weeks Step 2 named as new to the page. Every other
week already has one — leave those entries exactly as they are. If no week is
new, write no recap at all.

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
Commit naming the weeks that were new, push, and open a PR. Report the weeks you
added, the scores the tool read for them, and any team renames (naming every
file changed for the rename). Do not report on weeks that were merely rewritten
from the export — that happens every run and is not news.

If nothing was new and the export matched the page, there will be no diff to
commit. Say "no new results" and open no PR.

STEP 8 — SAY SO
Nobody is watching this run, so a PR nobody is told about sits unmerged until
next Tuesday. Call the PushNotification tool with status "proactive" and a
message under 200 characters — one line, no markdown, leading with what to act
on and ending with the PR URL:

    SLUH '22 week 5 posted — PR ready to merge: <url>

Send one ONLY when there is something to act on:
  - you opened a PR, or
  - you STOPPED on a problem (no export in Drive, pairings disagreeing with the
    schedule, a short export that would have dropped weeks). Say what blocked
    it, not just that something did — a silent failed run and a quiet week look
    identical from a phone.

Send NOTHING when the run was clean and simply had no new week. That is the
expected outcome most of the season, and a notification saying so every week is
how notifications get ignored.
