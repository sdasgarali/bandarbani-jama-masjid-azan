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

## FCM data message contract (backend → device)
Data-only messages (no `notification` block) so the app fully controls behavior:
```json
{ "type": "SCHEDULE_UPDATED", "version": "7" }
{ "type": "TEST_AZAN" }
{ "type": "TEST_NOTIFICATION", "title": "…", "body": "…" }
{ "type": "CONFIG_UPDATED" }
```
On `SCHEDULE_UPDATED` / `CONFIG_UPDATED` the app enqueues a `SyncWorker`. On `TEST_AZAN`
the app plays the cached azan once. `TEST_NOTIFICATION` shows a local notification.

## Errors / codes
`AUTH_INVALID`, `AUTH_EXPIRED`, `VALIDATION`, `NOT_FOUND`, `RATE_LIMITED`, `FILE_INVALID`,
`FORBIDDEN`, `INTERNAL`. HTTP status mirrors the code (401/400/404/429/415/403/500).

## Rate limiting
Auth endpoints: 10/min/IP. General admin: 120/min. Device register: 30/min/IP.
