# League History — Android app

A native Android record book for the fantasy league, built for a Galaxy Z Fold.
It is a Kotlin/Compose port of the web record book that lives at the root of
this repository; the two share their data but not their code.

## What it does today

- **Record Book** — league champions, league losers and the all-time standings,
  sortable by any column, with a team profile that opens beside the list on a
  wide screen and over it on a narrow one.
- **Team profile** — career totals, championships and last-place finishes,
  season-by-season results, a wins-by-year chart, and the full head-to-head
  table. Tapping an opponent jumps to that manager.
- **Seasons** — every season, with regular-season and final-standings tables.
- **Settings** — theme (system/light/dark), dynamic colour, haptic strength,
  and the build version.
- **Three home-screen widgets** — see below.

### Widgets

All three are Jetpack Glance widgets, resizable, and every row deep-links into
the app rather than just launching it.

| Widget | Default size | Shows | Tapping a row |
| --- | --- | --- | --- |
| League Champions | 2×2, grows to 4×4 | Reigning champion; title leaders once the widget is tall enough | Opens that manager's profile |
| All-Time Standings | 4×3, grows to 6×6 | Career records ordered by wins, as many rows as fit | Opens that manager's profile |
| Latest Season | 4×2, grows to 6×6 | Final standings from the most recent season | Opens that manager's profile |

The widget headers open the record book home or that season's page.

### Not yet ported

- **Playoff brackets.** The web record book draws a full bracket for each
  season; the app currently shows only the standings tables. The bracket data
  (`postseasonGames`) is parsed and already feeds playoff records, so the screen
  is the only missing piece.
- **Division standings.** Divisions are parsed but not shown as their own table.

## Architecture

```
app/src/main/java/com/personal/leaguehistory/
  data/local/          league.json DTOs and parsing
  data/repository/     LeagueRepositoryImpl (assets), SettingsRepositoryImpl (DataStore)
  di/                  ServiceLocator - two singletons, no framework
  domain/model/        League, Season, SeasonTeam, OwnerProfile, settings
  domain/repository/   Repository interfaces
  domain/usecase/      ProfileBuilder (the aggregation), StandingsSort
  ui/                  AppRoot, theme, components, format, haptics
  ui/screens/          recordbook, profile, seasons, settings
  widgets/             Glance widgets and their shared pieces
```

Data flows one way: repository → ViewModel → `StateFlow` → composable. UI code
does no parsing and no aggregation.

### Where the data comes from

League results live in `index.html` at the repository root, inside the
`LEAGUE_DATA` blob that the website reads. `tools/extract-league-data.js` copies
that blob to `android/app/src/main/assets/league.json`, which is bundled into
the APK.

```bash
node tools/extract-league-data.js
```

Run it after editing a season on the website and commit the result — CI fails if
the checked-in JSON does not match `index.html`.

`ProfileBuilder` is a deliberate line-by-line port of the site's
`createProfiles()`. Two rules there are easy to get wrong and are covered by
tests: only managers listed in `owners` get a profile (the 2021 season
references two who left), and `excludeFromHome` teams contribute their games but
not their season totals. The 2020 season was deleted by the league host, so only
its championship survives — it counts toward championship displays and nothing
else.

The dataset is static and ships in the APK, so the app is fully offline. Room is
not used: there is nothing to persist beyond preferences, which are in DataStore.
`LeagueRepository` is an interface, so a Room-backed cache can replace the asset
reader without touching any caller.

## Fold behaviour

Layout decisions come from window size, never from a model name.

- **Cover screen** — single pane, bottom navigation bar, standings rows collapse
  to a compact stat strip.
- **Inner display** — `ListDetailPaneScaffold` shows the list and the selected
  team at once, navigation moves to a rail, and standings rows expand to full
  columns.
- **Folding while running** — `MainActivity` handles the relevant config changes
  and is `resizeableActivity`, so the activity is not recreated. The selected
  team and season are hoisted into `rememberSaveable` state in `AppRoot`, so the
  selection survives even if the process does get recreated.

## Haptics

Every buzz goes through `ui/haptics/AppHaptics.kt`, which maps an intent
(`Tap`, `Select`, `Toggle`, `Confirm`, `Reject`, `LongPress`) onto a platform
`HapticFeedbackConstants` value. One setting scales the whole app:

- **Every control** (default) — buttons, rows, tabs and sort controls all buzz.
- **Meaningful actions only** — suppresses ordinary taps, matching the
  platform's usual restraint.
- **Off** — silent.

System haptic settings are respected: `FLAG_IGNORE_VIEW_SETTING` is never used,
so turning haptics off in Android settings turns them off here too.

## Building

Requires JDK 17 and the Android SDK (compileSdk 35).

```bash
cd android
./gradlew testDebugUnitTest      # unit tests
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease        # app/build/outputs/apk/release/app-release.apk
```

The debug build uses the application ID `com.personal.leaguehistory.debug`, so
it installs alongside a release build.

## Getting an APK onto the phone

1. Push to any branch. **Android CI** runs the tests and builds a debug APK.
2. Open the workflow run on GitHub and download the `league-history-debug`
   artifact.
3. Unzip it on the phone and install `app-debug.apk`.

For a release build, push a tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Android Release** builds, signs and verifies the APK, then attaches
`app-v1.0.0.apk` to the GitHub release.

### Signing

Release signing reads, in order: `android/keystore.properties` (git-ignored), or
these environment variables:

| Variable | GitHub secret |
| --- | --- |
| `SIGNING_STORE_FILE` | derived from `SIGNING_KEYSTORE_BASE64` |
| `SIGNING_STORE_PASSWORD` | `SIGNING_STORE_PASSWORD` |
| `SIGNING_KEY_ALIAS` | `SIGNING_KEY_ALIAS` |
| `SIGNING_KEY_PASSWORD` | `SIGNING_KEY_PASSWORD` |

Create a key once and back it up somewhere safe — Android will refuse to
upgrade an installed app if the signing identity changes:

```bash
keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias leaguehistory
base64 -w0 release.jks   # paste into the SIGNING_KEYSTORE_BASE64 secret
```

**If no signing secrets are configured the release workflow still succeeds, but
the APK is debug-signed** and cannot upgrade an install made with the real key.
The workflow prints a warning when this happens.

## Permissions

None. The app declares no runtime permissions: all data ships inside the APK,
and haptics need no permission when triggered from a view.

## Versioning

`versionName` / `versionCode` live in `app/build.gradle.kts`. Bump `versionCode`
for every installable build; the version is shown in Settings → About.
