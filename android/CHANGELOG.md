# Changelog

All notable changes to the Android app. Versions are semantic-ish;
`versionCode` increments with every installable build.

## 1.0.0 — initial native port

### Added

- Native Kotlin / Jetpack Compose / Material 3 application, replacing nothing —
  the web record book at the repository root is unchanged and still live.
- Record Book screen: league champions, league losers and all-time standings,
  sortable by every column with the website's sort defaults and tie-breakers.
- Team profile: career totals, championships, last-place finishes,
  season-by-season results, wins-by-year chart, and head-to-head table.
- Seasons screen: season list with regular-season and final-standings tables.
- Settings screen: theme mode, dynamic colour, haptic strength, version info.
- Three Jetpack Glance home-screen widgets — League Champions, All-Time
  Standings, Latest Season — all resizable, all deep-linking into the app.
- `leaguehistory://record/owner/{id}` and `leaguehistory://record/season/{year}`
  deep links, used by the widgets.
- Adaptive layout via `ListDetailPaneScaffold` and `NavigationSuiteScaffold`:
  single pane and bottom bar on the cover screen, list-detail and navigation
  rail on the inner display, with navigation state preserved across folding.
- App-wide haptics with a three-level setting (every control / meaningful
  actions only / off), respecting the system haptics setting.
- Adaptive launcher icon with foreground, background and monochrome layers, and
  the platform splash screen.
- `tools/extract-league-data.js`, which keeps `league.json` in sync with the
  `LEAGUE_DATA` blob in `index.html`.
- GitHub Actions: CI builds a debug APK on every push, and a tag build produces
  a signed release APK attached to the GitHub release.
- 27 unit tests covering the profile aggregation, sorting and formatting.

### Known gaps

- Playoff brackets are not drawn yet; the season screen shows standings only.
- Division standings are parsed but not surfaced as their own table.
