# Deployment & Setup

End-to-end setup for the Azan (Adhan) monorepo: **`/backend`** (Node + Express + Prisma +
MongoDB Atlas + Firebase Admin), **`/admin-panel`** (Next.js + TypeScript + Tailwind), and
**`/android`** (Kotlin + Jetpack Compose). It covers local development first, then production.

> The database is **MongoDB Atlas** through Prisma's `mongodb` provider. There are **no SQL
> migrations** — the schema is applied with `npm run prisma:push` (`prisma db push`). See
> [DATABASE.md](DATABASE.md).

Cross-links: [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) · [DATABASE.md](DATABASE.md) ·
[ANDROID_SCHEDULING.md](ANDROID_SCHEDULING.md) · [TESTING.md](TESTING.md).

Default ports: **backend `4000`**, **admin panel `3000`**. The Android emulator reaches the
backend at **`http://10.0.2.2:4000`** (the emulator's alias for the host machine's `localhost`).

---

## 1. Prerequisites

| Tool | Version | Used by | Notes |
|---|---|---|---|
| Node.js | **22 LTS** or newer | backend, admin-panel | `backend/package.json` sets `"engines": { "node": ">=22" }`. |
| npm | ships with Node 22 | backend, admin-panel | Or pnpm/yarn — examples below use npm. |
| MongoDB Atlas account | free (M0) tier is fine | backend | A replica-set cluster (Atlas default) is required for Prisma transactions. |
| Firebase project | — | backend + android | Cloud Messaging (FCM) + a service account for the Admin SDK. |
| Android Studio | latest stable | android | Bundles the Android SDK + emulator. |
| JDK | **17** | android | Required by the Android Gradle Plugin. Android Studio ships a matching JDK. |
| Git | any | all | — |

Verify Node:

```bash
node -v   # v22.x or newer
npm -v
```

---

## 2. MongoDB Atlas setup

1. **Create a cluster.** Sign in at <https://cloud.mongodb.com>, create a project, and create a
   free **M0** cluster (any provider/region close to you). Atlas clusters are replica sets by
   default — this is required for Prisma transactions.
2. **Create a database user.** *Database Access → Add New Database User*. Choose password auth,
   set a username + strong password, and grant **Read and write to any database** (or scope it to
   your app DB). Record the credentials — you'll put them in `DATABASE_URL`.
3. **Network access (IP allowlist).** *Network Access → Add IP Address*.
   - Local dev: **Add Current IP Address**, or `0.0.0.0/0` (allow anywhere) **for development
     only**.
   - Production: allow only your server's static/egress IP(s). Never leave `0.0.0.0/0` on a
     production cluster.
4. **Get the SRV connection string.** *Clusters → Connect → Drivers → Node.js*. Copy the string of
   the form:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **Add a database name** to the string (the segment after the host). This repo defaults to the
   `azan` database. URL-encode any special characters in the password (`@` → `%40`, etc.):
   ```
   DATABASE_URL="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/azan?retryWrites=true&w=majority"
   ```
   Put this in `backend/.env` (step 4). It matches the placeholder already in
   [`backend/.env.example`](../backend/.env.example).

---

## 3. Firebase setup (Cloud Messaging + Admin SDK)

The backend sends **data-only FCM messages** to devices (see the FCM contract in [API.md](API.md)).
The Android app receives them and syncs. You need two artifacts: a **service account key** (backend)
and a **`google-services.json`** (Android app).

1. **Create a Firebase project** at <https://console.firebase.google.com> (or reuse one).
2. **Cloud Messaging** is enabled by default for FCM v1 (HTTP v1 API, which `firebase-admin` uses).
   No extra toggling is required.
3. **Service account private key (backend).** *Project settings → Service accounts → Generate new
   private key*. This downloads a JSON file. Provide it to the backend in **one** of two ways
   (see `backend/.env.example`):
   - **`FIREBASE_SERVICE_ACCOUNT_PATH`** — a path to the JSON file on disk, e.g.
     `./firebase-service-account.json` (keep it out of git — it is in `.gitignore`).
   - **`FIREBASE_SERVICE_ACCOUNT_JSON`** — the raw JSON as a single-line string. Preferred for
     container/PaaS deploys where you inject secrets as env vars.

   > If **neither** is set, the backend still runs but FCM sends become no-ops and a warning is
   > logged — handy for local work that doesn't need push. Schedule/publish/registration all work
   > without Firebase; only the "propagate to devices" push is skipped.
4. **`google-services.json` (Android app).** *Project settings → General → Your apps → Add app →
   Android*. Use the app's package id (the one declared in the Android module's
   `applicationId`). Download `google-services.json` and place it at:
   ```
   android/app/google-services.json
   ```
   The `com.google.gms.google-services` Gradle plugin is already declared in
   [`android/build.gradle.kts`](../android/build.gradle.kts); the file is git-ignored — every
   developer supplies their own.

---

## 4. Backend — local development

```bash
cd backend

# 1. Environment
cp .env.example .env
#    Edit .env and fill in:
#      DATABASE_URL              (from Atlas, section 2, include the /azan db name)
#      JWT_ACCESS_SECRET         (long random string)
#      JWT_REFRESH_SECRET        (a different long random string)
#      ADMIN_EMAIL / ADMIN_PASSWORD  (seed admin — you'll log into the panel with these)
#      CORS_ORIGINS=http://localhost:3000
#      FIREBASE_SERVICE_ACCOUNT_PATH or _JSON   (optional locally)

# 2. Install dependencies
npm install

# 3. Generate the Prisma client
npm run prisma:generate

# 4. Apply the schema to Atlas (creates collections + indexes; NO SQL migrations)
npm run prisma:push

# 5. Seed the admin user (uses ADMIN_EMAIL / ADMIN_PASSWORD from .env)
npm run seed

# 6. Run in watch mode
npm run dev            # node --watch src/server.js  → http://localhost:4000
```

Generate strong secrets quickly:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Health check** — confirm the API is up and reachable:

```bash
curl http://localhost:4000/api/v1/schedule/current
#   → 404 { "error": { "code": "NOT_FOUND" } } before anything is published (expected)
#   → 200 { "data": { ... } } after the admin publishes a schedule
```

Then verify auth with the seeded admin:

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}'
#   → { "data": { "accessToken": "...", "refreshToken": "...", "admin": {...} } }
```

`npm start` runs the same server without file watching (used in production).

---

## 5. Admin panel — local development

```bash
cd admin-panel

# 1. Environment (Next.js reads .env.local)
cp .env.example .env.local
#    Set the backend base URL (must include /api/v1, no trailing slash):
#      NEXT_PUBLIC_API_BASE=http://localhost:4000/api/v1

# 2. Install + run
npm install
npm run dev            # next dev → http://localhost:3000
```

Open <http://localhost:3000> and **log in with the seeded admin** (`ADMIN_EMAIL` /
`ADMIN_PASSWORD` from the backend `.env`). From the dashboard you can set the five prayer times,
toggle prayers, upload the Azan MP3, publish, view devices, and send a test notification/azan.

> `NEXT_PUBLIC_*` variables are inlined at **build time** and exposed to the browser — never put
> secrets in them. Only the public API base URL belongs here.

---

## 6. Android app — local development

1. **Open the project.** In Android Studio: *Open* → select the `android/` directory. Let Gradle
   sync (JDK 17 required; Android Studio's bundled JDK is fine).
2. **Add Firebase config.** Copy your `google-services.json` (section 3.4) into
   `android/app/google-services.json`.
3. **Set the API base URL.** The app talks to the backend REST API. When running on the **Android
   emulator**, the host machine's `localhost` is reachable at **`http://10.0.2.2:4000`**, so the
   base URL is:
   ```
   API_BASE_URL = http://10.0.2.2:4000/api/v1
   ```
   Set this where the Android module reads it (a `BuildConfig` field / `local.properties` /
   `gradle.properties` value, per the app module's build config). For a **physical device** on the
   same LAN, use the host machine's LAN IP instead (e.g. `http://192.168.1.20:4000/api/v1`) and
   ensure the backend `CORS_ORIGINS` / firewall allows it.
   > **Cleartext HTTP:** `10.0.2.2` and LAN IPs are plain HTTP. Android blocks cleartext by
   > default (API 28+). The debug build must permit cleartext to these hosts (network-security
   > config / debug manifest). Production must use **HTTPS** — see section 8.
4. **Run.** Pick an emulator (API 33+ recommended to exercise notification + exact-alarm prompts)
   or a connected device, then **Run ▶**. Complete the first-run onboarding: notification
   permission → exact-alarm permission → device registration → schedule sync → audio download →
   alarms scheduled → home screen. See [ANDROID_SCHEDULING.md](ANDROID_SCHEDULING.md).

Build from the command line (from `android/`):

```bash
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
```

---

## 7. Environment variable reference

### Backend (`backend/.env` — template: `backend/.env.example`)

| Variable | Purpose | Example |
|---|---|---|
| `NODE_ENV` | Runtime mode. | `development` / `production` |
| `PORT` | HTTP port the API listens on. | `4000` |
| `PUBLIC_BASE_URL` | Public base URL used to build absolute audio URLs (no trailing slash). | `http://localhost:4000` |
| `DATABASE_URL` | MongoDB Atlas SRV string incl. DB name. | `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/azan?retryWrites=true&w=majority` |
| `JWT_ACCESS_SECRET` | Signs short-lived access tokens. Long random. | `<48+ random bytes hex>` |
| `JWT_REFRESH_SECRET` | Signs refresh tokens. **Different** from access secret. | `<48+ random bytes hex>` |
| `ACCESS_TTL` | Access-token lifetime (vercel/ms syntax). | `15m` |
| `REFRESH_TTL` | Refresh-token lifetime. | `30d` |
| `ADMIN_EMAIL` | Seed admin email (used by `npm run seed`). | `admin@example.com` |
| `ADMIN_PASSWORD` | Seed admin password. Change immediately in production. | `ChangeMe123!` |
| `CORS_ORIGINS` | Comma-separated allowed origins. `*` in dev only. | `http://localhost:3000` |
| `MAX_AUDIO_MB` | Max Azan upload size (MB). | `10` |
| `UPLOAD_DIR` | Directory where uploaded MP3s are stored. | `uploads` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Raw service-account JSON (one line). Use **this or** the path. | `{"type":"service_account",...}` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to the service-account JSON file. | `./firebase-service-account.json` |
| `DEVICE_INACTIVE_MINUTES` | Minutes of inactivity before a device is derived `INACTIVE`. | `1440` |

### Admin panel (`admin-panel/.env.local` — template: `admin-panel/.env.example`)

| Variable | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | Backend REST base URL (incl. `/api/v1`, no trailing slash). Browser-visible. | `http://localhost:4000/api/v1` |

### Android (`android/` build config)

| Value | Purpose | Example (emulator) | Example (device / prod) |
|---|---|---|---|
| `API_BASE_URL` | Backend REST base URL used by the app. | `http://10.0.2.2:4000/api/v1` | `https://api.example.com/api/v1` |
| `google-services.json` | Firebase/FCM config file (not an env var). | `android/app/google-services.json` | same |

---

## 8. Production deployment

### 8.1 Backend (Node host / VPS / container)

- **Build/run.** No compile step — run with `node src/server.js` (`npm start`). Manage the process
  with **PM2** or a container. Set `NODE_ENV=production`.

  ```bash
  # PM2
  cd backend
  npm ci --omit=dev
  npm run prisma:generate
  npm run prisma:push        # applies schema/indexes to the PRODUCTION Atlas cluster
  pm2 start src/server.js --name azan-backend
  pm2 save
  ```

- **Reverse proxy + HTTPS.** Terminate TLS at Nginx/Caddy/Traefik in front of the Node process.
  Serve the API over **HTTPS** (Let's Encrypt) so the Android app can use a secure `API_BASE_URL`.
  Example Nginx location:
  ```nginx
  location /api/ {
      proxy_pass         http://127.0.0.1:4000;
      proxy_set_header   Host $host;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto $scheme;
      client_max_body_size 12m;   # allow the audio upload (>= MAX_AUDIO_MB)
  }
  ```
- **CORS.** Set `CORS_ORIGINS` to your real admin-panel origin(s), comma-separated
  (e.g. `https://admin.example.com`). Do **not** use `*` in production.
- **Secrets.** Inject `DATABASE_URL`, JWT secrets, `ADMIN_PASSWORD`, and the Firebase service
  account via the platform's secret store / env, never via committed files. Prefer
  `FIREBASE_SERVICE_ACCOUNT_JSON` in PaaS environments.
- **Atlas.** Use a dedicated **production** cluster (M10+ for real workloads), a restrictive IP
  allowlist (only the server's egress IP), and a distinct DB user.
- **Audio persistence (critical).** Uploaded MP3s live under `UPLOAD_DIR` (default `uploads/`).
  On ephemeral/containerized hosts this directory is wiped on redeploy — mount a **persistent
  volume** at `UPLOAD_DIR`, or move storage to an object store (S3/GCS) behind the same
  `/audio/:version/file` route. Devices only re-download when the audio version/checksum changes,
  so losing the file breaks re-installs and audio swaps.

**Minimal backend Dockerfile** (suggestion):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
RUN npx prisma generate
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# Run prisma db push once at deploy time (job/init), not on every boot:
#   docker run --rm --env-file .env <image> npx prisma db push
VOLUME ["/app/uploads"]
CMD ["node", "src/server.js"]
```

### 8.2 Admin panel (Vercel or Node host)

- **Vercel (recommended).** Import the repo, set **Root Directory = `admin-panel`**, add the env var
  `NEXT_PUBLIC_API_BASE=https://api.example.com/api/v1`. Vercel runs `next build` and serves it.
- **Self-hosted Node.** 
  ```bash
  cd admin-panel
  npm ci
  NEXT_PUBLIC_API_BASE=https://api.example.com/api/v1 npm run build
  npm start        # next start → serve behind Nginx/HTTPS on your chosen port
  ```
  `NEXT_PUBLIC_API_BASE` must be present **at build time**; rebuild if it changes.

### 8.3 Android — build a distributable APK (no Play Store)

This app is distributed as a **signed APK that users sideload** (install directly). No Google
Play, no App Bundle (`.aab`). Full step-by-step is in [`android/README.md`](../android/README.md);
summary:

- **Set the backend URL** the phones will reach. Put it in `android/local.properties`:
  `API_BASE_URL_RELEASE=http://<your-server-ip>:4000/api/v1/` (LAN/self-host) or an `https://…`
  URL. Cleartext HTTP is permitted via `res/xml/network_security_config.xml` so a self-hosted
  http backend works; prefer HTTPS if the server is public.
- **Fastest test APK** (debug-signed, fine for sideloading):
  ```bash
  cd android
  ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
  ```
- **Signed release APK.** Create a keystore once, then build:
  ```bash
  cd android
  keytool -genkeypair -v -keystore azan-release.jks \
    -alias azan -keyalg RSA -keysize 2048 -validity 10000
  cp keystore.properties.example keystore.properties   # then fill in the 4 values
  ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
  ```
  Never commit `keystore.properties`, `*.jks`, or `local.properties` (already gitignored).
- **Install on a phone.** Transfer the `.apk`, enable "Install unknown apps" for your file
  manager/browser, tap to install — or `adb install app-release.apk`.
- **FCM.** The same Firebase project's `google-services.json` must be present at
  `android/app/google-services.json` to compile, and its package id must be `com.bandarbani.azan`.
- **Distribution ideas:** share the `.apk` via a download link, QR code, USB, or an MDM if the
  masjid manages devices. Bump `versionCode`/`versionName` in `app/build.gradle.kts` for each
  new APK so users can tell versions apart.

---

## 9. Secrets hygiene

**Never commit** any of the following (they are covered by the per-component `.gitignore` files):

- `backend/.env`, `admin-panel/.env.local` (any real `.env*` file)
- Firebase service account JSON (`firebase-service-account.json`) and `google-services.json`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `DATABASE_URL` (contains the DB password), Atlas user password
- `ADMIN_PASSWORD`
- The Android release **keystore** and its passwords

Only the `.env.example` templates (with placeholder values, no real secrets) are committed.

**What to rotate — and when:**

| Secret | Rotate when | How |
|---|---|---|
| JWT access/refresh secrets | Suspected leak; periodically | Change env values + restart. Invalidates existing tokens (users re-login; devices re-register secret flow as needed). |
| Atlas DB password | Leak; staff change | Rotate the Atlas DB user password, update `DATABASE_URL`, restart. |
| Firebase service account key | Leak; periodically | Generate a new key in Firebase, swap the env/file, delete the old key. |
| Seed admin password | Immediately after first prod login | Change via the panel / re-seed with a new `ADMIN_PASSWORD`. |
| Android release keystore | **Never** rotate — losing it means users must uninstall/reinstall to take a new-keystore APK (signatures won't match). Store multiple secure backups. | Keep `azan-release.jks` + `keystore.properties` in a password manager / secure vault. |

If a secret is ever committed, treat it as compromised: rotate it **and** purge it from git history.
