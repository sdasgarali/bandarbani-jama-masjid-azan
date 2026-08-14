# Testing

How to run automated tests for each component, plus the **manual end-to-end acceptance
checklist** and the **reliability test matrix** with copy-pasteable `adb` commands to simulate
each condition.

Cross-links: [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) · [DATABASE.md](DATABASE.md) ·
[ANDROID_SCHEDULING.md](ANDROID_SCHEDULING.md) · [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Backend tests (Jest + Supertest)

```bash
cd backend
npm test
```

`npm test` runs `jest --runInBand` with `NODE_ENV=test`. The suites live in `backend/tests/`:

| Suite | Covers |
|---|---|
| `auth.test.js` | Admin login (valid/invalid credentials), token issue, `/auth/me`, refresh rotation, protected-route rejection without/with an expired token. |
| `schedule.test.js` | Create/update schedule meta, per-prayer update (`time`/`enabled`/toggles), **publish** → new `ScheduleVersion` + version bump, and the published **payload shape** (matches [DATABASE.md](DATABASE.md)). |
| `scheduleCurrent.test.js` | `GET /schedule/current` returns the latest published payload; **ETag / `If-None-Match`** behavior (200 with body vs 304 when the version matches); 404 before anything is published. |
| `devices.test.js` | Device registration (returns a `deviceSecret`), FCM token update, heartbeat/sync (`lastSyncAt`/`lastActiveAt`, `currentVersion`), and schedule retrieval by a registered device. |
| `admin.test.js` | Admin FCM actions (`test-notification`, `test-azan`) and remote config upsert/list. |

**These tests run WITHOUT a real MongoDB or Firebase.** Prisma is backed by an in-memory fake
(`tests/helpers/memoryPrisma.js`), the app is wired through `tests/helpers/testApp.js`, and
`tests/setup.js` injects test secrets and a dummy `DATABASE_URL`. FCM sends are mocked, so no
network, Atlas cluster, or service-account key is needed to run the suite.

Lint the backend:

```bash
cd backend
npm run lint      # eslint over src/, prisma/, tests/
```

---

## 2. Admin panel — build & lint checks

The admin panel has no unit-test suite in the MVP; its gates are a clean **type-checked build**
and **lint**:

```bash
cd admin-panel
npm run lint      # next lint (ESLint + eslint-config-next)
npm run build     # next build — fails on TypeScript or build errors
```

A green `next build` confirms every page/route compiles and types are sound. Run these before
every deploy. For a live smoke test, start it against a running backend:

```bash
npm run dev       # then log in with the seeded admin at http://localhost:3000
```

---

## 3. Android tests (JUnit)

Pure-Kotlin logic is unit-tested on the JVM; system-integration behavior (reboot rescheduling) is
covered by instrumented / Robolectric tests. Run from the `android/` directory.

```bash
cd android

# JVM unit tests (fast, no device/emulator)
./gradlew test                    # Windows: gradlew.bat test

# Instrumented tests (need a running emulator or connected device)
./gradlew connectedAndroidTest
```

**Unit tests cover:**

| Area | What is asserted |
|---|---|
| `AlarmTimeCalculator` — next fire | Given prayer `HH:mm` + IANA timezone + "now", computes the correct next fire instant. |
| `AlarmTimeCalculator` — passed → tomorrow | If today's prayer time has already passed, the next fire rolls to **tomorrow**. |
| `AlarmTimeCalculator` — DST | Fire instants computed via `ZonedDateTime` in the schedule's timezone stay correct across a DST transition (spring-forward / fall-back). |
| Schedule JSON parsing | The published payload (`version`, `timezone`, `prayers[]`, `audio{}`; see [DATABASE.md](DATABASE.md)) deserializes into the domain model; malformed JSON is rejected safely. |
| Duplicate prevention / request-code determinism | The alarm request code derived from `(prayer.ordinal, epochDayLocal)` is **stable** for the same prayer/day, so re-running `rescheduleAll` replaces rather than duplicates alarms. |
| Timezone recompute | Changing the schedule timezone recomputes fire instants to the new zone. |

**Instrumented tests cover:** broadcasting a fake `BOOT_COMPLETED` and asserting alarms are
re-armed (via a shadow/Robolectric `AlarmManager`), per [ANDROID_SCHEDULING.md](ANDROID_SCHEDULING.md) §8.

---

## 4. Manual end-to-end acceptance checklist

This maps **1:1 to the Final Acceptance Criteria** (prompt §20). Run it against a live stack:
backend on `:4000`, admin panel on `:3000`, and the app on an emulator pointing at
`http://10.0.2.2:4000/api/v1`. Tick each box only after the stated verification passes.

**Setup:** start backend (`npm run dev`), seed admin (`npm run seed`), start admin panel
(`npm run dev`), launch the Android app.

- [ ] **Admin can log in.** Open `http://localhost:3000`, log in with `ADMIN_EMAIL` /
  `ADMIN_PASSWORD`. → Dashboard loads; `POST /api/v1/auth/login` returns `200` with tokens.
- [ ] **Admin can set five prayer times.** Set Fajr/Dhuhr/Asr/Maghrib/Isha (e.g. 04:18 / 12:05 /
  16:38 / 18:21 / 19:42). → `PUT /schedule/prayers/:prayer` succeeds for each; values persist on reload.
- [ ] **Admin can publish the schedule.** Click **Publish**. → `POST /schedule/publish` returns a
  new `version`; `GET /schedule/versions` lists it.
- [ ] **Android app can register itself.** Complete onboarding. → A row appears in the admin
  **Devices** list; `POST /devices/register` returned a `deviceSecret`.
- [ ] **Android app can sync the schedule.** Onboarding sync (or **Synchronize now**) pulls the
  published schedule. → `GET /schedule/current` returns `200`; app shows the five times on Home.
- [ ] **Android app stores the schedule locally.** Turn on airplane mode, kill and relaunch the
  app. → Home still shows the correct times (served from Room, no network).
- [ ] **Android app downloads and caches the Azan.** After sync, the audio is fetched. → File
  exists at `filesDir/azan/azan_v<version>.mp3`; last-sync status shows success.
- [ ] **Android app schedules local prayer alarms.** → `adb shell dumpsys alarm | grep <app pkg>`
  lists armed alarms for the enabled prayers.
- [ ] **Azan plays at the configured time.** Set the *next* prayer 2 min ahead in the panel,
  publish, let the device sync, lock the screen, wait. → Azan audio plays at the exact time.
- [ ] **App does not require internet at prayer time.** Repeat the above with the device in
  **airplane mode** at fire time. → Azan still plays (local file, local alarm).
- [ ] **Schedule changes propagate to devices.** Change a time and publish. → Device receives the
  FCM `SCHEDULE_UPDATED` data message and re-syncs (last-sync time updates) without manual action.
- [ ] **Old alarms are removed.** After the change above → `dumpsys alarm` no longer lists the old
  fire instants.
- [ ] **New alarms are scheduled.** After the change → `dumpsys alarm` lists the new instants.
- [ ] **Device reboot restores alarms.** `adb reboot`, wait for boot. → `dumpsys alarm` again lists
  the prayer alarms (re-armed by `BootReceiver`).
- [ ] **Duplicate alarms are prevented.** Tap **Synchronize now** several times / re-publish the
  same schedule. → Each prayer/day has exactly **one** alarm (deterministic request codes).
- [ ] **Admin can see registered devices.** Devices page shows model, app version, Android
  version, last sync, and active/inactive status.
- [ ] **Admin can send a test notification.** Select the device → **Send test notification**. →
  `POST /admin/test-notification` succeeds; a notification appears on the device.
  (Also verify **test azan**: `POST /admin/test-azan` → device plays the cached azan once.)
- [ ] **The entire system runs locally and deploys.** All of the above pass locally; the
  [DEPLOYMENT.md](DEPLOYMENT.md) production steps (Atlas prod cluster, HTTPS backend, admin panel
  build, signed release) complete without errors.

---

## 5. Reliability test matrix (prompt §10)

Each row is a condition the app must survive. **Expected:** enabled prayers still fire at the
correct local time, exactly once, with no duplicate alarms and no network dependency at fire time.
"How to simulate" uses `adb` where possible.

| # | Condition | How to simulate | What to verify |
|---|---|---|---|
| 1 | **Reboot** | `adb reboot` | After boot, `adb shell dumpsys alarm \| grep <pkg>` lists all prayer alarms; next azan still fires. |
| 2 | **App force-stop** | `adb shell am force-stop <pkg>` | Alarms already set with AlarmManager survive; on next reboot/boot receiver or system re-delivery they re-arm. (Note: force-stop can cancel pending alarms until the app runs again — verify a subsequent sync/boot re-arms.) |
| 3 | **App update** | Reinstall keeping data: `adb install -r app-release.apk` | `MY_PACKAGE_REPLACED` receiver re-arms alarms; schedule + audio still present. |
| 4 | **Timezone change** | `adb shell setprop persist.sys.timezone "America/New_York"` then `adb shell am broadcast -a android.intent.action.TIMEZONE_CHANGED` | Fire instants recompute to the new zone; alarms re-armed. |
| 5 | **Daylight saving (DST)** | Set device date to just before a DST boundary (Settings → Date/time, disable auto), or unit test `AlarmTimeCalculator` DST case | Prayer wall-clock times stay correct across the transition (computed via `ZonedDateTime`). |
| 6 | **Date change / rollover** | `adb shell "date MMDDhhmmYYYY.ss"` (root) or Settings → set tomorrow; also broadcast `android.intent.action.TIME_SET` | Next-day alarms are armed; the daily WorkManager tick re-arms on rollover. |
| 7 | **Schedule update** | Admin edits a time + **Publish** | Device gets FCM `SCHEDULE_UPDATED`, re-syncs, cancels old + arms new alarms. |
| 8 | **FCM token refresh** | Clear the FCM token (reinstall, or force a token refresh) | App re-registers the new token; `PUT /devices/fcm-token` updates it; pushes still arrive. |
| 9 | **Internet unavailable** | `adb shell svc wifi disable && adb shell svc data disable` (or airplane mode) | Azan still fires from local schedule + cached audio; sync retries with backoff when back online. |
| 10 | **Server unavailable** | Stop the backend process | App keeps using last local schedule; `SyncWorker` retries; no crash; no missed alarms. |
| 11 | **Audio download failure** | Point audio URL at a down host / kill backend mid-download | Old validated audio is retained (temp `.tmp` discarded); playback still works; worker retries. |
| 12 | **Audio corruption** | Replace cached file with garbage, or force a checksum mismatch | sha256 verification fails → corrupt file rejected, active pointer unchanged, re-download attempted. |
| 13 | **Battery optimization** | `adb shell dumpsys deviceidle whitelist -<pkg>` (remove from whitelist) | Exact alarms via `setAlarmClock` still fire; app guides user to whitelist but does not depend on it. |
| 14 | **Doze mode** | `adb shell dumpsys deviceidle force-idle` (undo: `adb shell dumpsys deviceidle unforce`) | Azan fires during Doze (`setAlarmClock` / `setExactAndAllowWhileIdle`). |
| 15 | **Locked screen** | Lock the device before the fire time | Azan plays with the screen locked (foreground playback service, `USAGE_ALARM` audio attrs). |
| 16 | **Screen off** | Turn the screen off (`adb shell input keyevent 26`) before fire time | Azan still plays; playback service starts from the alarm. |
| 17 | **Multiple Android versions** | Run on emulators for API 26/29/31/33/34+ | Onboarding requests the right perms per version (POST_NOTIFICATIONS 33+, exact-alarm 31+); alarms + playback work on each. |
| 18 | **Duplicate scheduling** | Tap **Synchronize now** / re-publish repeatedly, then `adb shell dumpsys alarm` | Exactly one alarm per enabled prayer/day — deterministic request codes prevent duplicates. |

**Handy `adb` reference**

```bash
adb devices                                             # list attached devices/emulators
adb shell dumpsys alarm | grep <app.package.id>         # inspect armed alarms
adb reboot                                              # reboot device
adb shell am broadcast -a android.intent.action.TIMEZONE_CHANGED
adb shell am broadcast -a android.intent.action.TIME_SET
adb shell dumpsys deviceidle force-idle                 # enter Doze
adb shell dumpsys deviceidle unforce                    # leave Doze
adb shell dumpsys deviceidle whitelist +<pkg>           # add to battery whitelist (+) / remove (-)
adb shell input keyevent 26                             # toggle screen off/on
adb shell am force-stop <app.package.id>                # force-stop the app
```

> Replace `<app.package.id>` / `<pkg>` with the Android module's `applicationId`.
