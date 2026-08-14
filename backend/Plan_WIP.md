# Plan WIP — Audio Library + Announcements

## SESSION_CONTEXT_RETRIEVAL
> DONE. Audio library + announcements implemented. prisma generate OK; 65/65 tests pass (8 suites).
> Remaining external step (owner): run `prisma db push` against Atlas.

## Immediate TODO
(none — feature complete)

## Completed
- [x] 1. schema.prisma: AzanAudio +label/+kind + back-relations; PrayerSchedule +defaultAudioId/relation; PrayerTime +audioId/relation; new Announcement model. (2026-08-14)
- [x] 2. Audio upload: accept label,kind; stop deactivating others; GET /audio new projection. (2026-08-14)
- [x] 3. services/schedule.js: buildAudioRef (path), buildPayload new shape, collectPublishData, publishSchedule. (2026-08-14)
- [x] 4. scheduleController: updateMeta defaultAudioId; updatePrayer audioId; publish via service. (2026-08-14)
- [x] 5. announcements controller/routes/validators; POST multipart, GET, PUT, DELETE; auto-publish + FCM. (2026-08-14)
- [x] 6. routes/index.js mount /announcements. (2026-08-14)
- [x] 7. validators/schemas.js schemas added. (2026-08-14)
- [x] 8. memoryPrisma: announcement model + fields + delete/deleteMany(where); seedFixtures payload. (2026-08-14)
- [x] 9. Updated schedule.test.js + scheduleCurrent.test.js; added audio.test.js + announcements.test.js. (2026-08-14)
- [x] 10. npx prisma generate OK; npm test → 65 passed. (2026-08-14)

## Blockers / Notes
- Existing buildAudioRef used `url`; DATABASE.md now uses `path:"audio/<version>/file"`. Switching to `path`.
- Publish must resolve per-prayer + default audios into deduped audios[].
