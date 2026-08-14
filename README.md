# Azan (Adhan) — Admin-Controlled Prayer Schedule System

An administrator controls the daily prayer (Azan) schedule from a web admin panel. Android
devices sync the schedule once, store it locally, and play a pre-recorded Azan at each prayer
time **without needing the internet at prayer time** — even when the app is closed and the
phone is locked (subject to Android OS restrictions).

Built for **Bandarbani Jama Masjid**.

## Monorepo layout
```
/android        Native Android app — Kotlin, Jetpack Compose, Room, AlarmManager, WorkManager,
                Media3/ExoPlayer, Firebase Cloud Messaging, Hilt.
/admin-panel    Web admin dashboard — Next.js (App Router) + TypeScript + Tailwind.
/backend        REST API — Node.js + Express + Prisma (MongoDB Atlas) + Firebase Admin SDK + JWT.
/docs           Architecture, API, Database, Android scheduling, Deployment, Testing.
```

## The core idea (why it's reliable)
The Android app **never calls the backend at prayer time**. Instead:

```
Admin edits & publishes ─► Backend snapshots a new schedule version ─► FCM data message
   ─► App fetches the new schedule (REST) ─► App updates Room ─► App cancels old alarms
   ─► App schedules new EXACT alarms (AlarmManager) ─► At prayer time an alarm fires a
      BroadcastReceiver ─► plays the local Azan audio (offline).
```
If FCM is delayed/unavailable, the app keeps using its last valid local schedule. A daily
WorkManager job re-pulls and re-arms alarms as a safety net.

## Tech stack
| Layer | Tech |
|---|---|
| Android | Kotlin, Compose (Material 3), Room, WorkManager, AlarmManager, Media3, FCM, Hilt, Retrofit |
| Admin panel | Next.js + React + TypeScript + Tailwind |
| Backend | Node.js, Express, Prisma ORM, **MongoDB Atlas**, Firebase Admin SDK, JWT, bcrypt, multer |

## Quick start (local dev)
> Full details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Backend** (port 4000)
```bash
cd backend
cp .env.example .env          # set DATABASE_URL (Atlas), JWT secrets, admin creds
npm install
npm run prisma:generate
npm run prisma:push           # syncs indexes to MongoDB Atlas (no SQL migrations)
npm run seed                  # creates the admin + example schedule (Fajr..Isha)
npm run dev
```

**Admin panel** (port 3000)
```bash
cd admin-panel
cp .env.example .env.local    # NEXT_PUBLIC_API_BASE=http://localhost:4000/api/v1
npm install
npm run dev                   # log in with the seeded admin
```

**Android**
```
Open /android in Android Studio (JDK 17, Android SDK 34/35).
Add app/google-services.json (from your Firebase project).
API_BASE_URL defaults to http://10.0.2.2:4000/api/v1 (emulator → host).
Run on an emulator or device.
```

## Documentation
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design & data flow
- [docs/API.md](docs/API.md) — REST endpoints + FCM message contract
- [docs/DATABASE.md](docs/DATABASE.md) — MongoDB/Prisma models + published payload shape
- [docs/ANDROID_SCHEDULING.md](docs/ANDROID_SCHEDULING.md) — alarms, audio, reliability
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — setup (Atlas, Firebase) + production
- [docs/TESTING.md](docs/TESTING.md) — tests + manual E2E acceptance checklist

## Status
- **Backend**: complete; 35 Jest tests pass; verified live against MongoDB Atlas
  (login → publish → device-authed sync with ETag/304 → register → heartbeat).
- **Admin panel**: complete; `npm run build` clean.
- **Android**: complete buildable Gradle project (open in Android Studio; add `google-services.json`).

## Security / secrets
Never commit `.env`, Firebase service account, `google-services.json`, JWT secrets, DB password,
admin password, or keystores — all are covered by `.gitignore`. See the secrets section in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Extensibility (designed for, not yet implemented)
GPS-based prayer calculation, multiple cities/mosques, Hanafi/Shafi settings, Qibla, Islamic
calendar, Ramadan mode, Jummah & pre-Azan notifications, multi-language, analytics.
