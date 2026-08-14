# Plan WIP — Azan (Adhan) App Monorepo

## SESSION_CONTEXT_RETRIEVAL
> Building a production-ready admin-controlled Azan Android app system.
> Monorepo: /android (Kotlin+Compose), /admin-panel (Next.js), /backend (Node+Express+Prisma+**MongoDB Atlas**+Firebase), /docs.
> DB DECISION (user override 2026-08-14): MongoDB Atlas via Prisma `mongodb` provider (ObjectId ids, `prisma db push`, no SQL migrations).
> Approach: (1) lock shared contract via docs, (2) implement 3 apps against contract, (3) integrate + verify backend.
> Current: scaffolding + docs written; implementing components.

## Immediate TODO
- [x] Inspect repo (empty greenfield)
- [x] Check toolchain (Node 22 ok; no JDK/Postgres locally)
- [x] Write Plan_WIP.md
- [x] Write docs (ARCHITECTURE, DATABASE, API, ANDROID_SCHEDULING, DEPLOYMENT, TESTING)
- [x] Build backend (Express + Prisma + Firebase Admin + JWT + tests) — 35 tests pass
- [x] Build admin panel (Next.js) — build clean
- [x] Build Android app (Kotlin + Compose + Room + AlarmManager + FCM + Media3)
- [x] Integrate: prisma push + seed to real Atlas; live E2E smoke test all green
- [x] Root README + .gitignore

## Completed
- [x] Repo inspection (2026-08-14)
- [x] Full MVP scaffold + verification (2026-08-14)

## Verified against real MongoDB Atlas (2026-08-14)
- prisma db push created all collections + indexes; seed created admin + schedule.
- Live HTTP: LOGIN 200, UPDATE ASR 200, PUBLISH v1 201, CURRENT(device auth) 200 (5 prayers,
  ETag "1"), 304 revalidate, REGISTER 201 (secret), HEARTBEAT 200 (currentVersion=1), DEVICES 200.

## Remaining for the user (external, cannot be done here)
- Provide Firebase project: service account JSON (backend) + google-services.json (android) to
  enable real FCM push. Backend no-ops FCM cleanly until then.
- Build/run Android in Android Studio (no JDK/Android SDK in this environment).

## Blockers / Notes
- No JDK/Android SDK here: Android app shipped as complete buildable Gradle source; user builds in Android Studio.
- No local Postgres: Prisma schema + migrations provided; user runs `prisma migrate`.
- Firebase requires user's own project + service account (not committed; .env.example provided).
- MVP acceptance criteria per prompt section 20 drive definition of done.
