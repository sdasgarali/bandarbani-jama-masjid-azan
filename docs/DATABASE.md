# Database Design

**MongoDB Atlas** via Prisma ORM (`provider = "mongodb"`). Source of truth:
`backend/prisma/schema.prisma`. Schema is applied with `prisma db push` (MongoDB is schemaless,
so there are no SQL migrations — `db push` syncs indexes/constraints). All timestamps stored UTC.

## MongoDB / Prisma conventions
- Every `id` is `String @id @default(auto()) @map("_id") @db.ObjectId`.
- Foreign keys are `@db.ObjectId` scalar fields with Prisma relations.
- `Json` fields map to native BSON documents.
- Unique + compound indexes declared with `@unique` / `@@unique` / `@@index` and pushed via
  `prisma db push` (Prisma creates the corresponding Mongo indexes).
- A replica set is required for Prisma transactions — Atlas clusters are replica sets by default.

## Entity overview

| Model            | Purpose |
|------------------|---------|
| `Admin`          | Admin users (login). |
| `RefreshToken`   | Persisted refresh tokens (rotation / revocation). |
| `PrayerSchedule` | The single current editable schedule (draft). One active schedule for MVP. |
| `PrayerTime`     | Five rows (Fajr…Isha) belonging to a schedule; time + toggles. |
| `ScheduleVersion`| Immutable published snapshot (JSON) with monotonic `version`. |
| `AzanAudio`      | Uploaded audio metadata (filename, mime, size, checksum, version, active). |
| `AppConfig`      | Key/value global config (e.g. current publish pointer, audio pointer). |
| `Device`         | Registered Android installs. |
| `FcmToken`       | Current FCM token per device (history-friendly). |
| `AuditLog`       | Every admin mutation. |
| `AppRelease`     | Hosted APK builds for in-app auto-update (versionCode, apk file ref, checksum). |

## Relationships
- `PrayerSchedule` 1—* `PrayerTime`.
- `PrayerSchedule` 1—* `ScheduleVersion` (each publish = new version snapshot).
- `Device` 1—* `FcmToken` (latest active token used for sends).
- `Admin` 1—* `RefreshToken`, `Admin` 1—* `AuditLog`.

## Enums
- `Prayer`: `FAJR | DHUHR | ASR | MAGHRIB | ISHA`.
- `DeviceStatus`: `ACTIVE | INACTIVE` (derived: INACTIVE if `lastActiveAt` older than threshold).

## Key fields

### Admin
`id, email (unique), passwordHash, name, role (default "admin"), createdAt, updatedAt`

### PrayerSchedule
`id, name, timezone (IANA, e.g. "Asia/Dhaka"), currentVersion (int), isPublished (bool),
 createdAt, updatedAt`

### PrayerTime
`id, scheduleId, prayer (enum), time (string "HH:mm" 24h), enabled (bool),
 audioEnabled (bool), notificationEnabled (bool)` — unique (scheduleId, prayer)

### ScheduleVersion
`id, scheduleId, version (int), timezone, payload (Json — the frozen times+toggles+audio ref),
 publishedById, publishedAt` — unique (scheduleId, version)

### AzanAudio
`id, filename, storedName, mimeType, sizeBytes, checksumSha256, version (int),
 durationMs (nullable), isActive (bool), uploadedById, createdAt`

### Device
`id (ObjectId), deviceId (uuid, unique, app-generated), deviceSecretHash, platform ("android"),
 appVersion, androidVersion (sdk int), model (nullable), timezone, lastSyncAt (nullable),
 lastActiveAt, createdAt`  — device auth = `X-Device-Id` (deviceId) + `X-Device-Secret` (bcrypt-checked)

### FcmToken
`id, deviceId, token (unique), isActive, createdAt, updatedAt`

### AppRelease
`id (ObjectId), versionCode (unique Int), versionName (String), notes (String?),
 mandatory (Bool default false), apkStoredName (String), apkOriginalName (String),
 sizeBytes (Int), checksumSha256 (String), uploadedById (ObjectId?), createdAt`
 — "latest" = row with the max `versionCode`.

### AppConfig
`id (ObjectId), key (unique String), value (Json), updatedAt`  — e.g. `{"key":"active_audio_id","value":"..."}`

### AuditLog
`id, adminId (nullable), action (string), entity (string), entityId (nullable),
 metadata (Json), ip (nullable), createdAt`

## Published payload shape (ScheduleVersion.payload)
```json
{
  "version": 7,
  "timezone": "Asia/Dhaka",
  "prayers": [
    {"prayer":"FAJR","time":"04:18","enabled":true,"audioEnabled":true,"notificationEnabled":true},
    {"prayer":"DHUHR","time":"12:05","enabled":true,"audioEnabled":true,"notificationEnabled":true},
    {"prayer":"ASR","time":"16:38","enabled":true,"audioEnabled":true,"notificationEnabled":true},
    {"prayer":"MAGHRIB","time":"18:21","enabled":true,"audioEnabled":true,"notificationEnabled":true},
    {"prayer":"ISHA","time":"19:42","enabled":true,"audioEnabled":true,"notificationEnabled":true}
  ],
  "audio": {
    "id":"...", "version":3, "url":"/api/v1/audio/3/file",
    "checksumSha256":"...", "sizeBytes":123456, "mimeType":"audio/mpeg"
  },
  "publishedAt":"2026-08-14T09:00:00.000Z"
}
```
This exact shape is what `GET /api/v1/schedule/current` returns and what the Android app parses.
