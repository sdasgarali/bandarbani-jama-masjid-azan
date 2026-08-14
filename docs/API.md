# API Specification

Base URL: `/api/v1`. JSON. Auth via `Authorization: Bearer <accessToken>` for admin routes.
Device routes use a lightweight device secret returned at registration (`X-Device-Id` +
`X-Device-Secret`). All responses: `{ "data": ... }` on success, `{ "error": { "code","message" } }` on failure.

## Auth (admin)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/login` | `{email,password}` | → `{accessToken, refreshToken, admin}` |
| POST | `/auth/refresh` | `{refreshToken}` | rotates refresh token → new pair |
| POST | `/auth/logout` | `{refreshToken}` | revokes refresh token |
| GET  | `/auth/me` | — | current admin (requires access token) |

Access token TTL ~15m, refresh ~30d, rotated on use. Passwords bcrypt-hashed.

## Schedule (admin)
| Method | Path | Body | Notes |
|---|---|---|---|
| GET  | `/schedule` | — | current draft schedule + prayer times |
| PUT  | `/schedule` | `{timezone, name?}` | update schedule meta |
| PUT  | `/schedule/prayers/:prayer` | `{time?,enabled?,audioEnabled?,notificationEnabled?}` | update one prayer |
| POST | `/schedule/publish` | — | snapshot → new `ScheduleVersion`, bump version, FCM fan-out |
| GET  | `/schedule/versions` | — | list published versions |

## Schedule (device / public read)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/schedule/current` | device | latest **published** payload (shape in DATABASE.md). 200 or 404 if never published. Supports `If-None-Match` ETag = version. |

## Audio
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/audio` | admin | multipart `file` (MP3). Validates mime+size, computes sha256, bumps audio version, sets active. |
| GET  | `/audio` | admin | list audio metadata |
| GET  | `/audio/:version/meta` | device/admin | metadata for a version |
| GET  | `/audio/:version/file` | device/admin | streams the MP3 (supports Range) |

Upload limits: mimetype `audio/mpeg`, max 10MB (configurable via `MAX_AUDIO_MB`).

## Devices
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/devices/register` | none | `{deviceId, platform, appVersion, androidVersion, model, timezone, fcmToken}` → `{deviceSecret}` |
| PUT  | `/devices/fcm-token` | device | `{fcmToken}` update token |
| POST | `/devices/heartbeat` | device | `{timezone?, appVersion?, scheduleVersion?}` updates lastActiveAt/lastSyncAt → `{currentVersion}` |
| GET  | `/devices` | admin | list devices (status, appVersion, lastSync, lastActive) |

## Admin actions (FCM)
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/admin/test-notification` | admin | `{deviceIds?[]}` (all if omitted) — sends test notification |
| POST | `/admin/test-azan` | admin | `{deviceIds?[]}` — sends data msg `type=TEST_AZAN` |
| POST | `/admin/config` | admin | `{key,value}` remote config upsert |
| GET  | `/admin/config` | admin | list config |

## App releases / auto-update (in-app APK updates, no Play Store)
The backend hosts signed APK builds. The app checks the latest version on launch and offers
"Update now", downloading + installing the APK itself.

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/app/releases` | admin | multipart `apk` (file) + fields `versionCode` (int), `versionName` (str), `notes?` (str), `mandatory?` (bool). Validates extension `.apk` + size ≤ `MAX_APK_MB` (default 100), computes sha256, stores under `uploads/apk/`. Rejects a duplicate `versionCode`. |
| GET  | `/app/releases` | admin | list all releases (newest first) |
| GET  | `/app/latest-version` | public | latest release by `versionCode`. → `{ versionCode, versionName, notes, mandatory, sizeBytes, checksumSha256, apkPath }`. `apkPath` is relative (`app/releases/:versionCode/file`); the app builds the absolute URL from its own API base. 404 if no releases. Supports `ETag = versionCode`. |
| GET  | `/app/releases/:versionCode/file` | public | streams the APK (`application/vnd.android.package-archive`, `Content-Disposition: attachment`), supports Range. |

The app compares the server `versionCode` with its own `BuildConfig.VERSION_CODE`. If greater →
show the update dialog. `mandatory=true` → non-dismissible. After download, the app verifies the
sha256, then launches the system installer via a `FileProvider` (requires the user-granted
`REQUEST_INSTALL_PACKAGES` / "install unknown apps"). Signature must match the installed app's
keystore or Android rejects the update.

## FCM data message contract (backend → device)
Data-only messages (no `notification` block) so the app fully controls behavior:
```json
{ "type": "SCHEDULE_UPDATED", "version": "7" }
{ "type": "TEST_AZAN" }
{ "type": "TEST_NOTIFICATION", "title": "…", "body": "…" }
{ "type": "CONFIG_UPDATED" }
{ "type": "APP_UPDATE_AVAILABLE", "versionCode": "2" }
```
On `SCHEDULE_UPDATED` / `CONFIG_UPDATED` the app enqueues a `SyncWorker`. On `TEST_AZAN`
the app plays the cached azan once. `TEST_NOTIFICATION` shows a local notification.
`APP_UPDATE_AVAILABLE` (sent automatically when an admin uploads a new release) makes the app
re-check `/app/latest-version` and surface the update prompt/notification.

## Errors / codes
`AUTH_INVALID`, `AUTH_EXPIRED`, `VALIDATION`, `NOT_FOUND`, `RATE_LIMITED`, `FILE_INVALID`,
`FORBIDDEN`, `INTERNAL`. HTTP status mirrors the code (401/400/404/429/415/403/500).

## Rate limiting
Auth endpoints: 10/min/IP. General admin: 120/min. Device register: 30/min/IP.
