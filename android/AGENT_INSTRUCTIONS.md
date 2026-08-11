# Android Personal App — Master Agent Instructions

## Project Goal

Build a polished, native Android application intended primarily for my personal
use on a Samsung Galaxy Z Fold 8.

The exact purpose of the application may evolve over time. Build the project so
features can be added, removed, and reorganized without requiring major
architectural rewrites.

This is NOT intended to be a generic cross-platform app.

Prioritize:

1. Excellent Galaxy Z Fold 8 support
2. Native Android functionality
3. Modern UI
4. Performance
5. Reliability
6. Maintainable code
7. Easy GitHub-based development
8. Easy APK generation and sideloading

Do not artificially restrict functionality because something would be
inappropriate for a mass-market Play Store application. This is a personal
application installed on my own devices.

However, continue to follow Android security best practices and do not
unnecessarily request sensitive permissions.

---

## Technology Stack

Use: Kotlin, Jetpack Compose, Material 3, Material 3 Adaptive where appropriate,
AndroidX, Kotlin Coroutines, Kotlin Flow / StateFlow, ViewModel architecture,
Navigation Compose, Room for structured persistent data when appropriate,
DataStore for preferences/settings, WorkManager for reliable background work
when appropriate, Jetpack Glance for Android home-screen widgets, Gradle Kotlin
DSL.

Prefer official Android/Jetpack libraries over third-party dependencies whenever
practical.

Do not introduce a dependency simply to avoid implementing a small amount of
straightforward functionality.

---

## Architecture

Use a clean, modular architecture. Suggested structure:

```
app/
  data/
    local/
    remote/
    repository/
  domain/
    model/
    repository/
    usecase/
  ui/
    components/
    navigation/
    screens/
    theme/
  widgets/
  services/
  workers/
  utilities/
```

Do not over-engineer simple features.

The application should have clear separation between UI, application state,
business logic, data persistence, external APIs, and Android system
integrations.

UI composables should generally not directly perform networking, database
operations, or complex business logic.

---

## Galaxy Z Fold 8 Design Philosophy

This application should be designed specifically with the Galaxy Z Fold form
factor in mind.

Do NOT simply create a normal phone interface and stretch it when the phone is
unfolded. Treat the Fold as having multiple useful application environments.

### Cover Screen

Use a compact, focused interface. Prioritize one-column layouts, quick actions,
glanceable information, large touch targets, minimal unnecessary navigation, and
easy one-handed operation. Do not overcrowd the cover display.

### Inner Display

Take advantage of the additional space. Prefer list + detail, dashboard + detail
panel, navigation rail + content, two-pane interfaces, three-column dashboards
where useful, master/detail layouts, and larger charts and data visualizations.

Do not simply make buttons, cards, and text dramatically larger. Use the
additional space to display MORE useful information.

### Adaptive Layouts

Base layout decisions primarily on available window size rather than checking for
a specific model name. Use Android window size classes and adaptive APIs.

The application should gracefully react to the cover screen, unfolded inner
screen, portrait, landscape, split screen, floating/multi-window environments
when applicable, and folding/unfolding while the application is already running.

Changing display state should NOT require restarting the application.

Where useful, account for folding features and hinge/posture information.

### Fold Continuity

The application must maintain state when the phone is folded or unfolded. If the
user is viewing Team → Player → Statistics and unfolds the device, they should
still be looking at that player. The larger interface may reveal additional
panels or information, but navigation state must remain intact. Likewise,
folding should intelligently collapse the interface rather than resetting it.

---

## Navigation

Adapt navigation to screen size.

- **Compact layout** — bottom navigation, navigation drawer, compact top app bar.
- **Expanded layout** — navigation rail, persistent side navigation, multi-pane
  layouts.

Do not blindly use the same navigation component everywhere.

---

## Visual Design

Target a sleek, modern Samsung/Android aesthetic: clean, minimal,
information-dense when appropriate, subtle animations, rounded cards where
appropriate, strong typography hierarchy, consistent spacing, modern Material 3
components, excellent dark mode.

Avoid excessive gradients, excessive shadows, giant empty areas, enormous
headings, web-page-looking UI, unnecessary animations, and clutter.

The app should feel like a premium native Android application.

### Dynamic Color

Support Android dynamic color where appropriate. Also provide an application
theme that still looks intentional when dynamic color is disabled. Support
system, light, and dark themes. Store the preference using DataStore.

---

## Android System Integration

Take advantage of Android capabilities when they improve the experience:
notifications, notification actions, app widgets, Quick Settings tiles, the
share sheet, receiving shared content, intents, deep links, app shortcuts,
clipboard, camera, photo picker, location, Bluetooth, NFC, biometric
authentication, vibration/haptics, background work, foreground services where
legitimately required, local files, media controls, picture-in-picture where
appropriate.

Do NOT add all of these automatically. Use them when they provide genuine
functionality.

### Permissions

Use the minimum permissions necessary, requested contextually.

Bad: app opens → immediately asks for five permissions.
Good: user selects "Enable location-based feature" → request location permission.

The application should continue functioning as much as possible when optional
permissions are denied.

### Widgets

Architect the application so Android home-screen widgets can be added. Use
Jetpack Glance unless there is a strong technical reason not to. Widgets should
be designed separately from the main application's Compose UI, come in small,
medium and large sizes, and resize gracefully.

Useful widgets may include status cards, upcoming events, quick actions,
statistics, progress indicators, recent activity, favorites, and dashboards.

Widget interactions should deep-link into the relevant part of the application
whenever appropriate — tapping a player's widget should open that player's page
rather than merely opening the application's home screen.

### Quick Settings Tiles

If the application eventually contains functionality that would benefit from a
quick toggle or action, consider a Quick Settings tile. Do not add tiles merely
for novelty.

### Notifications

Build notifications using proper Android notification channels, with useful
actions where applicable. Allow notification categories to be independently
controlled where useful.

### Haptics

Use subtle haptic feedback for meaningful interactions: completing an action,
changing a major toggle, selecting an important option, drag/drop completion.

> **Deviation on record.** The owner explicitly asked for haptics on buttons
> throughout the app, which is broader than this section's default. The app
> resolves the conflict with a three-level setting — every control (the
> requested default), meaningful actions only (this section's behaviour), and
> off — rather than picking one and discarding the other.

---

## Local-First Philosophy

Whenever practical, make the app local-first. Core functionality should not fail
because internet access is unavailable. Use Room for structured application data
and DataStore for preferences and lightweight settings. The UI should read from
local state whenever practical while remote data synchronizes separately.

### Offline Support

Where appropriate: load cached/local data immediately, fetch new data in the
background, update local storage, and automatically update the UI. Do not make
users stare at loading screens when usable cached data exists.

### Networking

When external APIs are needed: isolate networking from UI, use typed models, and
handle HTTP errors, timeouts, malformed responses, rate limits and offline
conditions, caching appropriate data.

Never place secrets directly in the GitHub repository. If an API requires a
secret that cannot safely exist inside an APK, recommend a backend/proxy
architecture instead.

---

## State Management

Use unidirectional data flow:

```
Repository → ViewModel → StateFlow → Compose UI
```

UI actions flow back through ViewModels or appropriate controllers. Avoid large
amounts of mutable global state.

### Configuration Changes

Preserve important state across rotation, resizing, folding, unfolding and
multi-window changes. Do not rely on Activity recreation to solve layout changes.

---

## Performance

Avoid unnecessary recompositions, blocking the main thread, excessive network
calls, excessively large images, repeatedly recalculating expensive values, and
excessive polling. Use coroutines appropriately; heavy work must not run on the
main UI thread.

## Animations

Use animations primarily when they communicate spatial or state changes.
Animations should generally be subtle and fast. Do not make the app feel like a
demo reel.

## Accessibility

Include meaningful content descriptions, appropriate touch target sizes,
readable contrast, and support for font scaling where practical.

## Orientation

Do not unnecessarily lock orientation. Handle portrait and landscape
intelligently. If a feature genuinely benefits from locking orientation,
document why.

## App Icon

Include proper adaptive launcher icons with foreground, background, and
monochrome layers so themed icons work.

## Splash Screen

Use Android's native splash screen system. Keep it simple. No artificial
multi-second animation.

## Package Naming

Use a consistent namespace such as `com.personal.[appname]`. Do not change the
application ID casually after development begins — Android treats different
application IDs as different applications.

## Versioning

Use semantic-ish internal versioning (1.0.0, 1.1.0, 1.1.1). Increment
`versionCode` for every installable release build. Display version information
in Settings/About.

## Logging

Use structured logging during development. Do not leave excessive debug logging
in release builds. Errors should provide enough context to diagnose failures.

## Error Handling

Do not silently fail. Provide useful UI states for loading, empty data, offline
state, authentication failure, permission denied, API failure, and unexpected
error. Where reasonable, include Retry instead of forcing a restart.

---

## Testing

Create tests for important business logic — especially calculations, sorting,
filtering, state transformations, database logic, parsing and algorithms. UI
tests should cover critical workflows where reasonable. Do not spend
disproportionate effort testing trivial visual components.

### Fold-Specific Testing

Explicitly test the cover display (portrait, landscape if supported), the inner
display (portrait, landscape), and runtime transitions in both directions.

Verify: no crashes, navigation is preserved, selected content remains selected,
layout changes correctly, dialogs do not break, text fields retain state, and
scrolling behaves reasonably.

---

## GitHub Repository

GitHub is the source of truth. Maintain `README.md`, `AGENT_INSTRUCTIONS.md` and
`CHANGELOG.md`. Use meaningful commits.

Never commit API secrets, passwords, signing passwords, private keys,
unnecessary generated files, or IDE-specific junk. Configure `.gitignore`
correctly for Android Studio/Gradle.

### GitHub Actions

For normal commits/pull requests: checkout, configure Java, configure Gradle,
restore/cache dependencies, run tests, compile, build a debug APK, and upload it
as an artifact. The workflow must fail when compilation fails, required tests
fail, or critical lint/build checks fail.

### Release APK Workflow

Triggered by a GitHub Release or version tag (`v1.2.0`): build release APK, sign
it, verify it, attach it to the GitHub Release as `app-v1.2.0.apk`.

### APK Signing

Release builds use a persistent signing key that is never committed. Use GitHub
Actions secrets. The same signing identity must be preserved so future APK
updates remain compatible with the installed application. Back up the key
securely.

### Debug Builds

Debug APKs may use standard Android debug signing, and must be easy to retrieve
from GitHub Actions for rapid testing.

### Installation Workflow

```
agent modifies app → push to GitHub → Actions validates → APK generated
→ APK downloaded on the Fold → installed → test
```

Keep this workflow simple.

---

## Feature Development Process

When implementing a significant new feature:

1. Understand the feature.
2. Determine whether Android-native functionality is useful.
3. Determine how it should behave on the cover screen.
4. Determine how it should behave on the inner screen.
5. Determine whether it should have a widget.
6. Determine whether background work is necessary.
7. Determine required permissions.
8. Design data/state architecture.
9. Implement the feature.
10. Test compact layout.
11. Test expanded layout.
12. Test folding/unfolding.
13. Run tests/build.
14. Update documentation.

### UI Feature Rule

For every major new screen, explicitly consider THREE layouts: compact (cover
screen), expanded (what extra information or controls appear on the inner
display), and transition (what happens if the user folds or unfolds while the
screen is open). A screen is not complete until all three are addressed.

### Feature Scope Rule

Do not implement massive speculative systems. Build incrementally: working
simple version → test → improve, rather than a large unfinished architecture.

### Refactoring Rule

Agents may refactor when there is a clear architectural or maintenance benefit.
Do not rewrite functioning sections merely because another approach is
stylistically preferable. Preserve working behavior unless the refactor
intentionally changes it.

### Dependency Rule

Before adding a dependency: check whether Android/Jetpack already provides it,
verify it is actively maintained, ensure it provides meaningful benefit, and
avoid libraries with excessive transitive dependencies for trivial
functionality.

### Security Rule

Never commit API keys, passwords, or private signing keys; never disable
certificate validation; never expose sensitive local information unnecessarily;
never create insecure WebView JavaScript bridges; never request powerful Android
permissions without a reason. This holds even though the app is personal.

### WebView Rule

Prefer native Compose interfaces. A WebView may be used when integrating
existing web content, embedding something specifically designed for the web, or
when a web-based component provides substantial development benefit. Do NOT use
a WebView merely because HTML is easier. The application remains fundamentally
native Android unless specified otherwise.

---

## Future AI-Agent Instructions

Before making significant changes, read `README.md`, `AGENT_INSTRUCTIONS.md`,
`CHANGELOG.md`, and the relevant source files. Do not assume the architecture
from filenames alone; inspect the existing implementation before modifying it.

When finished: ensure the project compiles, run relevant tests, fix introduced
warnings/errors, update `CHANGELOG.md` and `README.md` when appropriate,
summarize files changed, explain important architectural decisions, and mention
remaining issues.

### Do Not Leave Fake Implementations

Do not claim functionality exists when it is hardcoded, mocked, placeholder-only,
or visually represented but nonfunctional. If something is unfinished, clearly
label it unfinished.

### No Silent Feature Removal

Do not remove existing functionality to make a new feature easier unless
specifically instructed. If two systems conflict, preserve the existing
functionality and explain the conflict.

---

## Personal App Philosophy

This application is built for one primary user. Optimize for their workflows,
their preferences, their Galaxy Z Fold 8, speed of iteration, and useful Android
integration. Compatibility with obscure devices is not a priority. Still use
good adaptive Android architecture rather than hardcoding every UI measurement
to one resolution.

---

## Current Application Idea

**Fantasy football league record book.**

### Purpose

A native companion to the web record book that already lives at the root of this
repository (`index.html` and the per-season pages). It presents the league's
complete history — champions, last-place finishes, all-time standings, team
profiles and head-to-head records — as a fast, offline, Fold-native app with
home-screen widgets.

### Primary user workflow

Glance at a widget → tap a manager → land on that manager's profile → compare
head-to-head records against the rest of the league.

### Major screens

- **Record Book** — champions, losers, all-time standings, with a team profile
  in the detail pane.
- **Seasons** — season list with regular-season and final-standings tables.
- **Settings / About** — theme, dynamic colour, haptics, version.

### Data sources

A single bundled asset, `app/src/main/assets/league.json`, generated from the
website's `LEAGUE_DATA` blob by `tools/extract-league-data.js`. No network, no
API keys, no accounts. `ProfileBuilder` ports the site's `createProfiles()`
aggregation and is covered by tests that assert the app and the site agree.

### Android integrations

- Three Jetpack Glance widgets (champions, all-time standings, latest season).
- Custom-scheme deep links (`leaguehistory://record/...`) used by widget taps.
- Haptics throughout, with a user-facing strength setting.
- Adaptive icon with a monochrome layer; platform splash screen.

Not used, deliberately: notifications (nothing is time-sensitive in a historical
record book), Quick Settings tiles (nothing to toggle), background work (the data
never changes between releases), and any runtime permission.

### Fold-specific behaviour

`ListDetailPaneScaffold` on both content screens and `NavigationSuiteScaffold`
for top-level navigation, so the cover screen gets one pane and a bottom bar
while the inner display gets list-detail and a rail. Selection state is hoisted
into `rememberSaveable` in `AppRoot`, and `MainActivity` declares the config
changes needed to survive folding without recreation.

### Open work

- Playoff brackets are not drawn yet (data is parsed; screen is missing).
- Division standings are parsed but not surfaced.
- Fold transitions have been reasoned about and coded for, but have not been
  exercised on real hardware or an emulator — see CHANGELOG known gaps.
