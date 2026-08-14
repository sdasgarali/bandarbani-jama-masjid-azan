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
 defaultAudioId (ObjectId? → AzanAudio — the fallback Azan when a prayer has no custom audio),
 createdAt, updatedAt`

### PrayerTime
`id, scheduleId, prayer (enum), time (string "HH:mm" 24h), enabled (bool),
 audioEnabled (bool), notificationEnabled (bool),
 audioId (ObjectId? → AzanAudio — this prayer's custom Azan; null ⇒ schedule.defaultAudioId)`
 — unique (scheduleId, prayer)

### ScheduleVersion
`id, scheduleId, version (int), timezone, payload (Json — the frozen times+toggles+audio ref),
 publishedById, publishedAt` — unique (scheduleId, version)

### AzanAudio  (general audio library — Azan clips AND announcement recordings)
`id, label (String?), kind (String @default "AZAN" — "AZAN" | "ANNOUNCEMENT"),
 filename, storedName, mimeType, sizeBytes, checksumSha256, version (int, unique — used by
 GET /audio/:version/file), durationMs (nullable), isActive (bool — legacy/global-default flag),
 uploadedById, createdAt`
 — Uploading adds a row to the library; it no longer deactivates the others. Prayers and
   announcements reference a specific audio by `audioId`.

### Announcement  (admin-scheduled one-off audio broadcast)
`id (ObjectId), label (String?), scheduledAt (DateTime, absolute instant, UTC), enabled (Bool
 @default true), audioId (ObjectId → AzanAudio), createdById (ObjectId?), createdAt`
 — the app schedules an exact alarm at `scheduledAt` and plays the referenced audio once.

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
Returned by `GET /api/v1/schedule/current` and parsed by the Android app. Each prayer carries its
own `audioId`; `audios[]` is the deduped list of every audio the app must download & cache;
`announcements[]` are future scheduled broadcasts. `audio.path` is **relative** — the app builds
the absolute URL from its own API base (`API_BASE_URL + path`).

```json
{
  "version": 8,
  "timezone": "Asia/Dhaka",
  "defaultAudioId": "a1",
  "prayers": [
    {"prayer":"FAJR","time":"04:18","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":"a2"},
    {"prayer":"DHUHR","time":"12:05","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":null},
    {"prayer":"ASR","time":"16:38","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":null},
    {"prayer":"MAGHRIB","time":"18:21","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":"a2"},
    {"prayer":"ISHA","time":"19:42","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":null}
  ],
  "audios": [
    {"id":"a1","label":"Default Azan","version":3,"path":"audio/3/file","checksumSha256":"...","sizeBytes":123456,"mimeType":"audio/mpeg"},
    {"id":"a2","label":"Makkah Azan","version":5,"path":"audio/5/file","checksumSha256":"...","sizeBytes":222333,"mimeType":"audio/mpeg"}
  ],
  "announcements": [
    {"id":"n1","label":"Eid Jama'at notice","scheduledAt":"2026-08-20T03:00:00.000Z","enabled":true,
     "audio":{"id":"a9","label":"Eid notice","version":7,"path":"audio/7/file","checksumSha256":"...","sizeBytes":98765,"mimeType":"audio/mpeg"}}
  ],
  "publishedAt":"2026-08-14T09:00:00.000Z"
}
```
Resolution rule for a prayer's Azan: use `prayer.audioId` → else `defaultAudioId` → else no audio
(notification only). `audios[]` always contains every audio referenced by a prayer or the default.
Announcements reference their own audio inline. `defaultAudioId`/`audioId` may be `null` if the
admin hasn't assigned audio yet.
