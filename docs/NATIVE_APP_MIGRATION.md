# Native App Migration Plan — Eznii Ya Dawly (iOS + Android)

**Goal:** Ship the existing app to the Apple App Store and Google Play as native
apps **with minimal code changes and no language migration**. The Next.js app
keeps running on Vercel exactly as it does today; a thin native shell wraps it
and adds the native capabilities stores expect (push, splash, share, haptics).

**Audience:** an execution agent. Each phase below is self-contained, ordered,
and verifiable. Do phases in order. Do not start a phase until the previous
phase's **Done when** checks pass.

---

## 0. Decision record (read first — do not re-litigate)

| Decision | Choice | Why |
|---|---|---|
| Wrapper tech | **Capacitor** | Generates real native Xcode + Android Studio projects that load the live Vercel site in a native WebView. Zero rewrite of RSC / Server Actions / Supabase cookie auth. |
| Hosting | **Stays on Vercel** | The app is server-rendered (React Server Components + Server Actions). It MUST keep a server. **Do NOT use `output: 'export'`** — static export breaks Server Actions, RSC data fetching, and Supabase cookie auth. This is the single biggest trap; see §1. |
| What loads in the app | `server.url = https://<prod-domain>` | The native app is a managed WebView pointed at production. Web deploys ship instantly to all users with no app-store review (content updates), while native shell changes go through review. |
| Push notifications | **Native** via APNs (iOS) + FCM (Android) | The current web-push service worker (`public/sw.js`) does NOT fire reliably on iOS when wrapped. Replace with `@capacitor/push-notifications`. The server already has a token→user table and `web-push` send path; we add a native token path alongside it (§4). |
| Dynamic Island / Live Activities | **Optional, separate phase, requires Swift** (§7) | Capacitor cannot do Live Activities from JS. This is the ONLY part that touches native language. The app ships to both stores **without** it; add later. The in-app web `LiveIsland` pill keeps working inside the WebView regardless. |

### App Store approval gate (non-negotiable)
Apple rejects bare WebView wrappers under Guideline **4.2 (Minimum
Functionality)**. To pass, the app must add native value beyond the website.
This plan's Phases 3–4 (native push, splash, share, haptics, status bar) are what
clear that bar — **they are required, not optional polish.** Do not submit to
Apple until §6's checklist is fully green.

---

## 1. Pre-flight: confirm the server-rendered constraints

**Do NOT change any of these. They are the reason we wrap instead of export.**

Verify (read-only) before touching anything:

```bash
# These MUST exist and MUST keep working — they prove we cannot static-export:
grep -rn "use server" src/lib/**/actions.ts        # Server Actions in use
grep -rn "createServerClient\|cookies()" src/lib/supabase/server.ts  # cookie auth
grep -n "output" next.config.ts                     # MUST NOT contain output:'export'
```

- The app authenticates via **Supabase cookies** set by Server Actions
  (`src/lib/auth/actions.ts`). A WebView shares the cookie jar with the loaded
  origin, so **login keeps working unchanged** as long as we load the real
  origin (not a bundled static copy).
- `next.config.ts` already raises `serverActions.bodySizeLimit` for photo
  uploads — uploads keep working in the WebView (it's the same origin).

**Done when:** you've confirmed Server Actions + cookie auth are in use and
`next.config.ts` has no `output: 'export'`. Write a one-line note in the PR that
static export was rejected for these reasons.

---

## 2. Phase A — Scaffold Capacitor (no app logic touched)

Adds Capacitor and generates the `ios/` and `android/` native projects. **No
change to any file under `src/`.**

### Steps
```bash
source "$HOME/.nvm/nvm.sh" && nvm use 20

# 1. Install Capacitor core + CLI + the two platforms
npm i @capacitor/core
npm i -D @capacitor/cli
npm i @capacitor/ios @capacitor/android

# 2. Initialise. appId is reverse-DNS, immutable once published — pick carefully.
npx cap init "Eznii Ya Dawly" "com.eznii.dawly" --web-dir=public
```

### `capacitor.config.ts` (create at repo root)
```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.eznii.dawly",
  appName: "Eznii Ya Dawly",
  // We do NOT bundle the web app. webDir is a throwaway (Capacitor requires one);
  // the app loads the live server below.
  webDir: "public",
  server: {
    // The native shell loads production. Web changes ship without app review.
    url: "https://<PROD_DOMAIN>",        // <-- fill in real domain
    cleartext: false,
    // Allow the WebView to navigate the app's own origins. Add the Supabase
    // project host so auth redirects stay in-app.
    allowNavigation: ["<PROD_DOMAIN>", "*.supabase.co"],
  },
  ios: { contentInset: "always" },
  android: { backgroundColor: "#0A0A0B" },
};

export default config;
```

```bash
# 3. Generate native projects
npx cap add ios
npx cap add android
```

### Git hygiene
Add to `.gitignore` (commit the native project sources, ignore build output):
```
# Capacitor / native build artifacts
ios/App/Pods/
ios/App/build/
android/.gradle/
android/app/build/
android/build/
*.xcworkspace/xcuserdata/
DerivedData/
```
Commit `ios/` and `android/` source trees, `capacitor.config.ts`, and the
package.json changes.

**Done when:**
- `npx cap doctor` reports both platforms healthy.
- `npx cap open android` launches Android Studio and the app builds & runs in an
  emulator, loading the live site (login works — proves cookie auth survives).
- `npx cap open ios` launches Xcode; app runs in the iOS Simulator and loads the
  site. (Simulator can't test push — that's Phase D.)
- `npm run build && npm run typecheck && npm run lint` still pass (no `src/`
  change should have affected them).

---

## 3. Phase B — Native chrome: splash, status bar, icons, safe areas

Pure configuration + asset generation. Still no `src/` logic change. This is part
of the 4.2 approval bar.

### Steps
```bash
npm i @capacitor/splash-screen @capacitor/status-bar
npm i -D @capacitor/assets

# Generate all icon/splash sizes from source images placed in ./assets/
#   assets/icon.png        (1024x1024, no transparency for iOS)
#   assets/splash.png      (2732x2732, centered logo on #0A0A0B)
#   assets/splash-dark.png (same, dark)
npx @capacitor/assets generate --iconBackgroundColor "#0A0A0B" \
  --splashBackgroundColor "#0A0A0B"
npx cap sync
```

### Status bar + safe areas
- Gold-on-black theme → status bar style **dark content background, light text**.
  Configure in each native project (Capacitor `StatusBar` plugin defaults set via
  `capacitor.config.ts` `plugins.StatusBar`).
- The web layout already handles viewport; verify the header/bottom-nav respect
  iOS safe areas inside the WebView. If the bottom nav is clipped by the home
  indicator, add `env(safe-area-inset-bottom)` padding **in the web CSS**
  (`src/app/globals.css` / the bottom-nav component) — this is the *only* likely
  `src/` change in this phase and it's CSS-only.

**Done when:** launch splash shows the brand mark on both platforms; status bar
text is legible over the black header; bottom nav clears the iOS home indicator;
app icon is correct on the home screen.

---

## 4. Phase C — Native push notifications (APNs + FCM)

Replaces the web-push path **on native only**. The web PWA push path
(`public/sw.js`, `src/lib/notifications/*`) stays for browser users. We add a
parallel native-token path; the server send logic branches by token type.

### Server side (current state to build on)
- Existing: a subscriptions table keyed by user, and `src/lib/notifications/send.ts`
  using `web-push` with VAPID. Goal-alert and rank-climb pushes already fan out
  to all subscribers (commit `3f7dfdb`).
- **Add a native token column/table** (idempotent migration, follows the project's
  additive-column rule in CLAUDE.md — back up first, `ALTER TABLE ... ADD COLUMN
  IF NOT EXISTS` or a new `native_push_tokens` table). Store `{ user_id, token,
  platform: 'ios'|'android' }`.
- **Send path:** branch in the notification sender — web subscriptions → existing
  `web-push`; native tokens → **FCM HTTP v1** (FCM relays to APNs for iOS too, so
  you need ONE server integration, Firebase, for both platforms). Reuse the same
  payload shape (`title`, `body`, `url`) the SW already expects.

### Client side (native only)
```bash
npm i @capacitor/push-notifications
```
- Add a small client module that, **only when running in Capacitor**
  (`Capacitor.isNativePlatform()`), registers for push and POSTs the device token
  to a new server route (e.g. `/api/push/native-register`). Guard so browser
  builds are untouched:
  ```ts
  import { Capacitor } from "@capacitor/core";
  if (Capacitor.isNativePlatform()) { /* register native push */ }
  ```
- Mount this once after login (e.g. in the app layout's client boundary). It is
  additive — the web `subscribeToPush` path is unchanged.

### Firebase / APNs setup (native config, no app logic)
1. Create a Firebase project; add iOS + Android apps with the `com.eznii.dawly`
   bundle id.
2. Android: drop `google-services.json` into `android/app/`.
3. iOS: drop `GoogleService-Info.plist` into `ios/App/App/`; enable the **Push
   Notifications** + **Background Modes (Remote notifications)** capabilities in
   Xcode; upload the **APNs auth key (.p8)** to Firebase.
4. Tap handling: notifications carry a `url`; on tap, route the WebView to that
   path (mirror the SW's `notificationclick` → `clients.openWindow(url)` logic
   using the push plugin's `pushNotificationActionPerformed` listener).

**Done when:** a goal-alert push delivered through the real cron pipeline appears
as a **native** banner on a physical iPhone and Android device with the app
closed, and tapping it deep-links to the right match page. (Push cannot be tested
in the iOS Simulator — use a real device.)

---

## 5. Phase D — Native niceties that justify the wrapper (4.2 bar)

Small, additive, all guarded by `Capacitor.isNativePlatform()`. Each is a few
lines and strengthens the store-approval case.

- `@capacitor/share` — native share sheet for the `/recap` text and profile
  cards (replaces `navigator.share` fallback when native).
- `@capacitor/haptics` — route the app's existing `haptic()` calls
  (`src/lib/celebrate.ts`) through native haptics when available (richer than the
  web Vibration API; fixes the "vibrate blocked until tap" warning seen on web).
- `@capacitor/app` — handle the Android hardware **back button** (navigate WebView
  history; exit only at the root) and app-resume refresh of live data.
- `@capacitor/browser` — open external links (sponsors, social) in the system
  browser instead of trapping them in the WebView.

**Done when:** Android back button behaves like a browser back; share sheet is
native; celebrations use native haptics on device; external links leave the app
cleanly.

---

## 6. Phase E — Store submission

### Shared
- Bump `appId` is final (`com.eznii.dawly`). Set version + build numbers.
- Privacy: the app collects auth + (optionally) push token + uploaded photos.
  Fill Apple **App Privacy** and Google **Data Safety** forms accordingly.
- Account deletion: Apple requires an in-app path to delete the account if you
  have accounts. The app has username/password accounts → provide a delete/contact
  path (can be a Settings link). **Verify before submitting.**

### iOS (App Store Connect)
- Apple Developer Program enrollment ($99/yr).
- Archive in Xcode → upload `.ipa` via App Store Connect / Transporter.
- Screenshots (6.7" + 5.5"), description, keywords.
- **4.2 readiness checklist (all must be true):**
  - [ ] Native push works on device (Phase C).
  - [ ] Native splash + icon + status bar (Phase B).
  - [ ] At least 2 native integrations from Phase D active.
  - [ ] App does not look like a bare browser (no visible URL bar, native back).

### Android (Google Play Console)
- One-time $25 registration.
- Build a signed **`.aab`** (`./gradlew bundleRelease` from `android/`, or via
  Android Studio) with an upload key; enroll in Play App Signing.
- Data Safety form, content rating, store listing.
- Android's WebView wrapper policy is more lenient than Apple's but the same
  native-value work applies.

**Done when:** both apps are accepted and live (or in the respective review
queues with no blocking feedback).

---

## 7. Phase F (OPTIONAL, native Swift) — Dynamic Island / Live Activity live score

> This is the **only** phase that requires writing native language (Swift). It is
> **not** required to ship. Do it after the apps are live if you want the iPhone
> Dynamic Island / lock-screen Live Activity showing the live score. Android has
> no Dynamic Island; the equivalent is a foreground-service ongoing notification
> (also native Kotlin) — scope separately if wanted.

### Scope (iOS only)
- A **Widget Extension** target in `ios/App` using **ActivityKit + WidgetKit +
  SwiftUI**. Defines a `LiveActivityAttributes` (teams, codes) with a dynamic
  `ContentState` (homeScore, awayScore, clock).
- **Start/update/stop** the Live Activity. Two options:
  1. **Local (simplest):** a small Capacitor custom plugin exposes
     `startLiveActivity(matchId)` / `updateLiveActivity(score, clock)` to JS; the
     web app calls it from the existing live polling (`use-live-match.ts`) while a
     match is live. Pure local updates; no extra backend.
  2. **Remote (richer, background updates):** push-to-start / ActivityKit push
     tokens updated from the server's existing goal-alert cron. More moving parts;
     only do this if local updates aren't enough.
- Recommend **option 1 first** — it reuses the live data the WebView already
  fetches and needs no server changes.

### Integration seam
- The web `LiveIsland` / `useLiveMatch` already know when a match is live and the
  current score/clock. The Capacitor plugin bridge is the handoff point: when
  `isNativePlatform()` and a match goes live → `startLiveActivity`; on each poll
  tick → `updateLiveActivity`; on full-time → `endLiveActivity`.

**Done when:** during a live match, the iPhone Dynamic Island / lock screen shows
the running score and clock, updating as the WebView's live data updates.

---

## What does NOT change (reassurance for the agent)

- **No language migration.** All app logic stays TypeScript/React/Next.js.
- **No rewrite of the data layer.** RSC, Server Actions, Drizzle, Supabase, the
  cron pipeline, scoring, grading — all untouched and keep running on Vercel.
- **No duplicate codebase.** One web app, wrapped twice. Web deploys still ship
  instantly to native users (they load the live origin).
- **`src/` changes are tiny and additive:** at most (a) a CSS safe-area tweak,
  (b) a guarded native-push registration module, (c) a few
  `Capacitor.isNativePlatform()`-gated calls for share/haptics/back-button, and
  (d) [optional] the Live Activity plugin bridge. Everything is behind a native
  guard so the web build is byte-for-byte unaffected in behavior.

## Risks / watch-items

- **Apple 4.2 rejection** if native value is thin → Phases B–D are mandatory, not
  optional. Submit only when §6's checklist is green.
- **Cookie auth in WebView:** loading the real origin keeps the cookie jar; if a
  cross-origin Supabase auth redirect ever escapes `allowNavigation`, login
  breaks — keep `*.supabase.co` (and the prod domain) in `allowNavigation`.
- **iOS push needs a real device + APNs key.** Budget for an Apple Developer
  account early (enrollment can take days).
- **`server.url` couples the app to one domain.** If the prod domain changes, the
  shell needs a new release. Keep it stable.
- **Live Activities are genuinely native (Swift).** Do not promise them as a
  "free" Capacitor feature; they are Phase F and optional.

## Suggested execution order & rough effort

| Phase | Effort | Native language? | Blocks store launch? |
|---|---|---|---|
| 1 Pre-flight | 0.5 day | no | — |
| A Scaffold | 0.5 day | no | yes |
| B Chrome | 0.5–1 day | no (config) | yes (4.2) |
| C Push | 1–2 days | no (Firebase config) | yes (4.2) |
| D Niceties | 1 day | no | recommended (4.2) |
| E Submission | 1–2 days | no | yes |
| F Live Activity | 2–4 days | **yes (Swift)** | **no — optional, post-launch** |
