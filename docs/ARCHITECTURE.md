# Architecture — Azan (Adhan) System

## 1. Purpose
An administrator controls the daily prayer (Azan) schedule from a web admin panel. Android
devices sync the schedule once, store it locally, and play a pre-recorded Azan at each prayer
time **without needing the internet at prayer time**.

## 2. High-level components

```
                 ┌──────────────────┐
   Admin  ─────► │  Admin Panel     │  Next.js (React) — auth, schedule editor, devices
                 │  (browser)       │
                 └────────┬─────────┘
                          │ REST (JWT)
                          ▼
                 ┌──────────────────┐        ┌────────────────────┐
                 │  Backend API     │◄──────►│  MongoDB Atlas     │
                 │  Node + Express  │ Prisma │  (schedules, devices│
                 │  + Prisma        │        │   audio, audit...)  │
                 └───┬──────────┬───┘        └────────────────────┘
                     │          │ Firebase Admin SDK (send data msgs)
                     │ REST     ▼
                     │     ┌──────────────┐
                     │     │  FCM         │  data-only push: "schedule changed"
                     │     └──────┬───────┘
                     ▼            ▼
                 ┌────────────────────────────┐
                 │  Android App (Kotlin)      │
                 │  Room + WorkManager +      │
                 │  AlarmManager + Media3     │
                 └────────────────────────────┘
```

## 3. The critical scheduling principle
**The Android app never calls the backend at prayer time.** Flow:

```
Admin edits + publishes → Backend bumps schedule version → FCM data message to devices
   → App fetches new published schedule (REST) → App updates Room
   → App cancels old alarms → App schedules new exact alarms (AlarmManager)
   → At prayer time, AlarmManager fires a BroadcastReceiver → plays local Azan audio
```
If FCM is delayed/unavailable, the app keeps using its last valid local schedule. A daily
WorkManager job also re-pulls the schedule and re-arms alarms as a safety net.

## 4. Component responsibilities

### Backend (`/backend`)
- Persistence: **MongoDB Atlas** via Prisma (`provider = "mongodb"`); schema synced with `prisma db push`.
- Admin auth (JWT access + refresh, bcrypt password hashing).
- CRUD for prayer schedule + per-prayer settings (enabled / audioEnabled / notificationEnabled).
- Publish → immutable `ScheduleVersion` snapshot + version counter bump; triggers FCM fan-out.
- Azan audio upload (validated MP3), served over HTTP with checksum + version.
- Device registration, FCM token update, heartbeat/sync.
- Test notification + trigger test Azan (targeted FCM).
- Audit log for every admin mutation. Rate limiting, CORS, input validation.

### Admin Panel (`/admin-panel`)
- Login/logout, dashboard, schedule editor (5 prayers + toggles), audio upload,
  publish, device list, test notification / test azan buttons.

### Android App (`/android`)
- First-run onboarding (explain → notification perm → exact-alarm perm → register →
  FCM token → sync → download audio → schedule alarms → home).
- Room store of current schedule + audio metadata.
- AlarmManager exact alarms; BOOT_COMPLETED / TIME/TIMEZONE change receivers reschedule.
- Media3/ExoPlayer playback from local file, plays on locked screen.
- FCM service triggers a sync WorkManager job (not playback directly).

## 5. Key design decisions
- **Data-only FCM** (not notification messages) so the app controls behavior and can wake to sync.
- **Exact alarms** via `setExactAndAllowWhileIdle` / `setAlarmClock`; on Android 12+ request
  `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` and guide the user if denied.
- **Idempotent alarms**: alarm request codes derived deterministically from
  `(scheduleVersion, prayerId, epochDay)` so re-runs never duplicate.
- **Audio swap safety**: new audio downloaded to a temp file, checksum-verified, then atomically
  promoted; old file kept until the new one validates.
- **No permanent foreground service**: only a short-lived foreground service during playback.
- **Extensible**: schedule model allows future location-based calculation, multiple mosques,
  multiple audios — none implemented in MVP but the schema/room leaves room.

## 6. Environments
Single `.env` per component (see each `.env.example`). Secrets never committed:
Firebase service account, JWT secrets, DB password, admin password.

See also: [DATABASE.md](DATABASE.md), [API.md](API.md), [ANDROID_SCHEDULING.md](ANDROID_SCHEDULING.md),
[DEPLOYMENT.md](DEPLOYMENT.md), [TESTING.md](TESTING.md).
