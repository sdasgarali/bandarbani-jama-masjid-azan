# Bandarbani Azan — Android User App

Native Kotlin (Jetpack Compose) app that plays a pre-recorded Azan at each admin-published prayer
time, **even when the app is closed, the screen is locked, and there is no internet at prayer
time**. It syncs the schedule + audio once (and on FCM push), stores everything in Room, and arms
exact `AlarmManager` alarms.

Package: `com.bandarbani.azan` · min SDK 26 · target/compile SDK 35 · Kotlin 2.0 · Gradle Kotlin DSL
+ version catalog.

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Android Studio | Ladybug (2024.2) or newer |
| JDK | 17 (bundled with Android Studio is fine) |
| Android SDK | Platform 34 **and** 35, Build-Tools 35.x |
| Gradle | 8.9 (via wrapper) |

> The Gradle **wrapper JAR** (`gradle/wrapper/gradle-wrapper.jar`) is a binary and is not committed
> here. Opening the project in Android Studio regenerates it automatically. From a CLI with a local
> Gradle installed you can also run `gradle wrapper --gradle-version 8.9` once in `android/` to
> create it, then use `./gradlew`.

---

## 2. Firebase / `google-services.json` (REQUIRED to compile)

The FCM path uses the Google Services Gradle plugin, which **requires** a real
`app/google-services.json` at build time.

1. Create a Firebase project → add an Android app with package name **`com.bandarbani.azan`**.
2. Download `google-services.json` and drop it in `android/app/google-services.json`.
3. A template is provided at `app/google-services.json.example` showing the expected structure —
   **do not** use it as-is (placeholder values). The real file is gitignored.

Without this file the build fails at the `:app:processDebugGoogleServices` task. Everything except
the FCM registration path is otherwise independent of it.

---

## 3. API base URL

The base URL is a `BuildConfig` field set in `app/build.gradle.kts` (never hardcoded in source):

- **debug** default: `http://10.0.2.2:4000/api/v1/`  (host loopback as seen from the emulator)
- **release** default: `http://SET_API_BASE_URL_RELEASE_IN_LOCAL_PROPERTIES:4000/api/v1/`
  — a deliberately non-working placeholder. A release build **must** override this (see below).

Override per-machine WITHOUT editing tracked files by adding to `android/local.properties`:

```properties
# Debug (device on the same Wi-Fi as your dev machine — use the machine's LAN IP, not 10.0.2.2):
API_BASE_URL=http://192.168.1.50:4000/api/v1/
# Release (the self-hosted server your phone must be able to reach — LAN IP or public host):
API_BASE_URL_RELEASE=http://<your-server-ip>:4000/api/v1/
```

The trailing slash matters (Retrofit base URL requirement).

> Cleartext HTTP to `10.0.2.2` works on the emulator because API 26 permits cleartext by default.
> A **release** APK on a real device pointing at a plain-HTTP server is blocked on Android 9+ unless
> cleartext is allowed. This project ships `app/src/main/res/xml/network_security_config.xml`
> (referenced from the manifest) which permits cleartext for a self-hosted backend — see §8.

---

## 4b. Build an installable APK (no Play Store)

The owner is **not** publishing to Google Play. These steps produce a plain `.apk` you can copy to a
phone and sideload.

> `app/google-services.json` is still required to **compile** (Firebase/FCM plugin) — see §2. FCM is
> the intended push path. If you want to build without setting up Firebase right now, see §8 for the
> minimal option, but keep FCM as the goal.

### A. Debug APK (quickest path — good for testing/sideloading)

```bash
cd android
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

This APK is already signed with the auto-generated **debug key**, so it installs and runs on any
phone. Perfect for quick sharing/testing. (It is a debug build, not size-optimized.)

### B. Release APK (signed with your own key — the shareable build)

1. **Generate a keystore** (once — keep the `.jks` file and its passwords safe; losing them means you
   can't ship updates that upgrade this install). From the `android/` directory:

   ```bash
   keytool -genkeypair -v -keystore azan-release.jks -alias azan \
           -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Create `keystore.properties`** from the template and fill in your values:

   ```bash
   cp keystore.properties.example keystore.properties
   # then edit keystore.properties:
   #   storeFile=../azan-release.jks   (relative to app/, so this points at android/azan-release.jks)
   #   storePassword=...
   #   keyAlias=azan
   #   keyPassword=...
   ```

   `keystore.properties`, `*.jks`, and `*.keystore` are gitignored — they never get committed.

3. **Set the release backend URL** in `android/local.properties` (see §3):

   ```properties
   API_BASE_URL_RELEASE=http://<your-server-ip>:4000/api/v1/
   ```

4. **Build:**

   ```bash
   ./gradlew assembleRelease
   # → app/build/outputs/apk/release/app-release.apk
   ```

   With `keystore.properties` present, the APK is signed with **your** release key. If
   `keystore.properties` is absent, the build still succeeds and falls back to the **debug** key so
   you always get an installable APK — but for anything you actually distribute, use your own key.

### C. Install on a phone

1. On the phone, enable **"Install unknown apps"** for whichever app you'll open the APK with
   (the file manager, or the browser you download it through): Settings → Apps → *that app* →
   *Install unknown apps* → allow.
2. Transfer `app-debug.apk` / `app-release.apk` to the phone (USB, Bluetooth, cloud, email, etc.).
3. Tap the APK in a file manager and confirm the install.

Alternatively, with the phone connected via USB and USB debugging on:

```bash
adb install app/build/outputs/apk/release/app-release.apk
# (use app-debug.apk for the debug build)
```

> The phone must be able to **reach the backend server** — same Wi-Fi/LAN as the server, or a
> publicly reachable URL. If the server is plain HTTP, cleartext is already permitted (see §8).

---

## 3b. In-app updates (auto-update, no Play Store)

The app updates itself: it checks the backend for a newer signed APK, downloads it, verifies the
sha256, and launches the system installer. There is no Play Store in this deployment.

### How it works

1. **On launch** (Home) and via **Settings → App info → "Check for updates"**, the app calls
   `GET /app/latest-version` (public endpoint) and compares the server `versionCode` with its own
   `BuildConfig.VERSION_CODE`.
2. If the server version is **strictly greater**, an "Update available" dialog appears (plus a banner
   on Home). `mandatory=true` makes the dialog **non-dismissible** and blocks use until updated.
3. "Update now" streams the APK to `getExternalFilesDir("updates")/app-v<code>.apk` (never buffered
   whole in memory), verifies the size + **sha256** against the release metadata, and deletes the
   partial file on any mismatch/failure.
4. "Install" launches the system package installer via a **FileProvider**
   (`${applicationId}.fileprovider`, paths in `res/xml/file_paths.xml`). On Android 8+ the user must
   have allowed **"Install unknown apps"** for this app; if not, the app deep-links to that settings
   screen first and explains why.
5. **FCM push:** when an admin uploads a new release the backend sends the data message
   `{"type":"APP_UPDATE_AVAILABLE","versionCode":"<n>"}`. The app re-checks and, if newer, posts a
   "tap to update" notification that opens Home and surfaces the dialog. All other FCM types
   (`SCHEDULE_UPDATED` / `CONFIG_UPDATED` / `TEST_AZAN` / `TEST_NOTIFICATION`) are unchanged.

Relevant code: `update/UpdateManager.kt`, `update/UpdateInfo.kt`, `ui/update/UpdateDialog.kt`,
`data/remote/dto/AppReleaseDto.kt`, the `latestVersion()` endpoint in `data/remote/AzanApi.kt`, and
the `REQUEST_INSTALL_PACKAGES` permission + FileProvider in `AndroidManifest.xml`.

### Shipping a new release (per update)

1. **Bump the version** in `app/build.gradle.kts` `defaultConfig`:
   ```kotlin
   versionCode = 2          // MUST increase every release (this is what the app compares)
   versionName = "1.1.0"    // human-facing, shown in the dialog/notification
   ```
2. **Build the APK** (`./gradlew assembleRelease`) — see §4b.
3. **Upload it** via the admin panel (`POST /app/releases` — multipart `apk` + `versionCode`,
   `versionName`, optional `notes`, `mandatory`). The backend computes the sha256 and fans out the
   `APP_UPDATE_AVAILABLE` FCM push.

> **CRITICAL — same signing key.** The update APK **must be signed with the SAME keystore** as the
> currently installed app, or Android **rejects** the install (signature mismatch) and the
> auto-update silently fails. Always sign releases with your own `keystore.properties` key (§4b B)
> and **never lose that keystore** — without it you cannot ship any install-upgradeable build.
> A debug-key build can only upgrade another debug-key build of the same key.

---

## 4. Build & run

```bash
cd android
# first time only (if no wrapper jar and you have a local gradle):
# gradle wrapper --gradle-version 8.9

./gradlew assembleDebug          # build APK
./gradlew testDebugUnitTest      # run JVM unit tests (scheduling, parsing, request codes)
./gradlew installDebug           # install on a connected device/emulator
```

Or just open `android/` in Android Studio and press Run.

---

## 5. Permissions & settings the user must grant (and why)

| Permission / setting | API | Why | Where handled |
|---|---|---|---|
| `POST_NOTIFICATIONS` | 33+ | Show prayer-time + playback notifications | Onboarding runtime request |
| `SCHEDULE_EXACT_ALARM` / "Alarms & reminders" | 31+ | Fire the Azan at the *exact* minute during Doze | Onboarding deep-link + Settings |
| Ignore battery optimizations | all | Improves reliability on aggressive OEMs (optional; app still works via `setAlarmClock`) | Settings guidance |
| `RECEIVE_BOOT_COMPLETED` | all | Re-arm alarms after reboot | Auto (BootReceiver) |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | 34 | Play audio from the background while locked | Auto (playback service) |
| `WAKE_LOCK` | all | Keep CPU awake during the short playback | Auto |
| `INTERNET` | all | Sync schedule + download audio (never at prayer time) | Auto |

We deliberately do **not** request `USE_EXACT_ALARM` (policy-restricted to alarm-clock apps); we use
the user-grantable `SCHEDULE_EXACT_ALARM` and guide the user if it is off.

---

## 6. How it works (map to the contract docs)

- `scheduling/AlarmTimeCalculator.kt` — pure `java.time` next-fire computation (DST-correct).
- `scheduling/AlarmScheduler.kt` — idempotent arming with deterministic request codes; `setAlarmClock`
  primary, `setExactAndAllowWhileIdle` fallback.
- `receiver/AzanAlarmReceiver.kt` — validates + plays + notifies + re-arms (self-healing chain).
- `receiver/BootReceiver.kt` — reboot / update / time / timezone → `RescheduleWorker`.
- `playback/AzanPlaybackService.kt` — short-lived `mediaPlayback` foreground service, `USAGE_ALARM`.
- `sync/SyncWorker.kt` + `audio/AudioSyncWorker.kt` — ETag schedule sync + checksum-verified atomic
  audio download.
- `fcm/AzanFirebaseMessagingService.kt` — data-only messages → sync / test azan / test notification.

See `../docs/ANDROID_SCHEDULING.md`, `../docs/API.md`, `../docs/DATABASE.md`, `../docs/ARCHITECTURE.md`.

---

## 7. Tests

JVM unit tests under `app/src/test/`:
- `AlarmTimeCalculatorTest` — next-fire, passed→tomorrow, DST spring-forward, timezone recompute.
- `RequestCodesTest` — deterministic codes, duplicate prevention, rolling-window bounds.
- `SchedulePayloadParsingTest` — parses the exact published payload shape.
- `PrayerScheduleViewTest` — next prayer / countdown formatting.
- `BootRescheduleTest` (Robolectric) — BOOT_COMPLETED enqueues the reschedule worker.

Instrumented stub under `app/src/androidTest/`:
- `RebootReschedulingInstrumentedTest` — documented on-device end-to-end reboot rescheduling.

---

## 8. Cleartext HTTP & the "no Firebase yet" option

### Cleartext HTTP (self-hosted backend)

Android 9+ blocks plain `http://` traffic by default. Because this app talks to a self-hosted
server that may only be reachable over HTTP (LAN IP or a VPS without TLS), the app ships
`app/src/main/res/xml/network_security_config.xml` and the manifest references it via
`android:networkSecurityConfig` (plus `android:usesCleartextTraffic="true"`). The default config is
**permissive** (cleartext allowed to any host) so it works with arbitrary LAN/VPS IPs out of the box.

Recommended hardening once your server address is fixed: front the backend with HTTPS (reverse proxy
+ Let's Encrypt, or a Tailscale/Cloudflare tunnel), then scope cleartext to a single `<domain>` (a
commented example is in the XML) or remove it entirely.

Either way, the phone must be able to **reach** the server: same Wi-Fi/LAN as the server, or a
publicly reachable host/URL.

### Building WITHOUT setting up Firebase right now (minimal option)

The Google Services Gradle plugin needs a real `app/google-services.json` to compile, so the build
fails at `:app:process*GoogleServices` without one. FCM (server-pushed schedule updates / test
triggers) is the **intended** path — set up Firebase (see §2) if you can.

If you must build before wiring Firebase, the minimal unblock is to drop a valid-shaped
`app/google-services.json` from a throwaway Firebase project (still free) with an Android app using
package `com.bandarbani.azan`. That satisfies the plugin and lets the app compile and run; FCM pushes
simply won't be delivered until you use the real project's config. The app otherwise functions
(sync-on-open, exact alarms, offline playback) independent of FCM.
