# Android Scheduling & Reliability Strategy

This is the heart of the app. Goal: **play the correct local Azan at each enabled prayer time,
even when the app is closed and the phone is locked, without internet at prayer time.**

## 1. APIs used and why
| Concern | API | Reason |
|---|---|---|
| Exact prayer trigger | `AlarmManager.setAlarmClock()` (primary) / `setExactAndAllowWhileIdle()` (fallback) | Only these fire exactly during Doze. `setAlarmClock` is the most Doze-resilient and is user-visible. |
| Fire target | `PendingIntent` → `AzanAlarmReceiver` (BroadcastReceiver) | Lightweight wake, then start short foreground service for playback. |
| Playback | Media3 / ExoPlayer in a short-lived foreground service (`mediaPlayback` type) | Reliable audio while locked/screen-off; foreground service satisfies background-start limits. |
| Sync on push | FCM data message → `SyncWorker` (WorkManager) | Decouples network from playback; retries with backoff. |
| Safety-net re-sync | Periodic `WorkManager` (once/day) | Recovers if an FCM message was missed. |
| Reboot / time change | `BootReceiver` on `BOOT_COMPLETED`, `TIME_SET`, `TIMEZONE_CHANGED`, `MY_PACKAGE_REPLACED` | Reschedule all alarms after reboot/update/clock change. |
| Local store | Room | Persist schedule + audio metadata; survives process death. |

## 2. Permissions & OS restrictions (must handle)
- **Android 13+ (API 33)**: `POST_NOTIFICATIONS` runtime permission — request in onboarding.
- **Android 12+ (API 31)**: exact alarms need `SCHEDULE_EXACT_ALARM`. Use
  `AlarmManager.canScheduleExactAlarms()`; if false, deep-link to
  `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` settings and explain why. (We do **not** use
  `USE_EXACT_ALARM` because that policy-restricted permission is only for alarm-clock apps;
  we request the user-grantable one and guide the user.)
- **Doze / battery optimization**: offer `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` with a
  clear explanation; app still works with `setAlarmClock` even if not whitelisted, but we guide.
- **Audio focus & Do Not Disturb**: request audio focus; play on the alarm/notification stream so
  DND alarm exceptions apply; use `USAGE_ALARM` attributes so it sounds while locked.
- **Foreground service type** (`mediaPlayback`) declared in manifest (API 34 requirement).

## 3. Alarm scheduling algorithm (idempotent)
For "today + tomorrow" we compute the next fire instants and arm only the **next N upcoming**
alarms (rolling window). On each alarm fire we (a) play if due, (b) schedule the *next* prayer.

Request code (deterministic, prevents duplicates):
```
requestCode = hash(prayer.ordinal, epochDayLocal)  // stable per prayer per day
```
Rearm procedure (`AlarmScheduler.rescheduleAll`):
1. Read published schedule + timezone from Room.
2. Cancel all previously-armed PendingIntents (tracked set of request codes in prefs).
3. For each enabled prayer, compute today's instant; if already passed, use tomorrow's.
4. Arm the *soonest* upcoming prayer with `setAlarmClock`; optionally pre-arm the next few.
5. Persist the armed request-code set. Because request codes are deterministic, re-running
   `rescheduleAll` never creates duplicate alarms — the same code replaces the same PendingIntent.

On alarm fire (`AzanAlarmReceiver`):
1. Validate the prayer is still enabled & the fire time matches the current schedule version
   (guards against stale alarms after an update).
2. If `audioEnabled` → start playback foreground service.
3. If `notificationEnabled` → post notification.
4. Call `rescheduleAll` to arm the following prayer (self-healing chain).

## 4. Timezone / DST / date change
- Store schedule times as local wall-clock `HH:mm` + the schedule's IANA timezone.
- Compute fire instants with `java.time.ZonedDateTime` in that timezone so DST is automatic.
- `TIMEZONE_CHANGED` / `TIME_SET` broadcasts trigger `rescheduleAll`.
- A daily WorkManager tick also rearms, covering date rollover.

## 5. Audio caching & safe replacement
- Audio stored at `filesDir/azan/azan_v<version>.mp3` + sha256 recorded in Room.
- `AudioSyncWorker`: download to `azan_v<new>.mp3.tmp`, verify sha256 + size, then rename to
  final; only then update Room's active pointer and delete old file. If verify fails, keep old.
- Playback always reads the currently-active local file — never the network.

## 6. FCM vs local schedule
- FCM `SCHEDULE_UPDATED` → `SyncWorker` fetches `/schedule/current` (ETag), updates Room,
  cancels old alarms, arms new. If offline, worker retries; existing local alarms stay armed.
- App is fully functional offline once synced at least once.

## 7. What we deliberately avoid
- No always-on background service polling the clock.
- No network call at prayer time.
- No dependence on high-frequency WorkManager (min interval 15m — too coarse for exact prayer).

## 8. Testing hooks (see TESTING.md)
`AlarmTimeCalculator`, schedule JSON parser, and duplicate-prevention logic are pure Kotlin and
unit-tested. Reboot rescheduling is covered by an instrumented test that broadcasts a fake
`BOOT_COMPLETED` and asserts alarms are set (via a shadow AlarmManager / Robolectric).
