# Plan WIP — Per-prayer custom Azan audio + scheduled Announcements

## SESSION_CONTEXT_RETRIEVAL
> DONE (pending user build). Implemented (A) per-prayer custom Azan audio from a library and
> (B) admin-scheduled announcements across DTOs, Room v2, Repository, AudioSyncWorker,
> AlarmScheduler, RequestCodes, AzanAlarmReceiver, NotificationHelper, Constants, Home UI + tests.
> NOT built (user builds). Self-reviewed for smart-cast/import correctness.

## Key facts
- Package root: com.bandarbani.azan
- API_BASE_URL ends with `/api/v1/` (trailing slash). Audio `path` is RELATIVE (e.g. "audio/3/file").
  Download URL = BuildConfig.API_BASE_URL + path.
- Room currently v1, single-active audio via `isActive`. Move to MANY rows keyed by `version` with
  `validated` flag; destructive fallback migration OK (cache).
- Deterministic request codes: prayers in [BASE, BASE+9]; announcements in separate range.

## Immediate TODO
- [x] Read docs + existing code
- [x] 1. DTOs (ScheduleDto.kt)
- [x] 2. Room entities (v2)
- [x] 3. DAOs + AppDatabase v2 (+ AnnouncementDao provider in AppModule)
- [x] 4. Repository apply/resolve/parse
- [x] 5. AudioSyncWorker download-all + validate + prune orphans
- [x] 6. AlarmScheduler per-prayer audio + announcements; RequestCodes.announcement()
- [x] 7. AzanAlarmReceiver PRAYER vs ANNOUNCEMENT
- [x] 8. Playback reused (path+label)
- [x] 9. Constants extras + announcement bases
- [x] 10. Home next-announcement chip
- [x] Tests updated (parsing) + announcement request-code tests added
- [x] README updated (§6b)
- [x] Self-review changed files

## Completed
- [x] Explored full codebase (2026-08-14)

## Blockers / Notes
- getActiveAudio() used by DeviceRegistrar + FCM TEST_AZAN + old receiver. Repurpose to resolve
  default audio (validated). observeActiveAudio unused in UI -> remove.
- Playback notification uses CHANNEL_AZAN_ID; announcements can reuse buildPlaybackNotification(label).
</content>
</invoke>
