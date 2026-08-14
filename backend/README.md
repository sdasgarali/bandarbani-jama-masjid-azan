# Azan Backend

Admin-controlled Azan (Adhan) Android app backend. Node 22 + Express + Prisma (MongoDB Atlas) + Firebase Admin (FCM).

## Setup

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL, JWT secrets, ADMIN_EMAIL/PASSWORD
npm install
npm run prisma:generate
npm run prisma:push           # sync indexes/constraints to MongoDB Atlas
npm run seed                  # creates admin + schedule + 5 prayer times
```

## Run

```bash
npm run dev      # watch mode
npm start        # production
```

Base URL: `http://localhost:<PORT>/api/v1` — see `../docs/API.md`.

## Test

```bash
npm test         # Jest + Supertest; Prisma & Firebase mocked, no DB/FCM required
```

## Notes

- FCM is optional in dev: if no Firebase service account is configured, sends are no-op'd and the app still runs.
- Audio uploads are stored under `backend/uploads/` (gitignored) and served with HTTP Range support.
- Refresh tokens rotate on use and are revocable (persisted as SHA-256 hashes).
