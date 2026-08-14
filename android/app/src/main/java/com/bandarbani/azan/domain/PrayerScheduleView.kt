package com.bandarbani.azan.domain

import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.scheduling.AlarmTimeCalculator
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * PURE view-model helper (no Android deps) that derives what the Home screen shows: the next prayer,
 * the remaining time, and the list of today's prayers with their fire instants. Unit-testable.
 */
object PrayerScheduleView {

    data class PrayerRow(
        val prayer: Prayer,
        val time: String,
        val enabled: Boolean,
        val nextFire: Instant?,
    )

    data class State(
        val rows: List<PrayerRow>,
        val nextPrayer: Prayer?,
        val nextFire: Instant?,
        val timeRemaining: Duration?,
    )

    /**
     * @param prayerTimes ordered (Prayer, "HH:mm", enabled)
     * @param zone schedule timezone
     * @param now reference instant
     */
    fun compute(
        prayerTimes: List<Triple<Prayer, String, Boolean>>,
        zone: ZoneId,
        now: Instant,
    ): State {
        val rows = prayerTimes.map { (prayer, time, enabled) ->
            val fire = if (enabled) {
                AlarmTimeCalculator.nextFireFor(prayer, time, zone, now)?.instant
            } else {
                null
            }
            PrayerRow(prayer, time, enabled, fire)
        }

        val soonest = rows
            .filter { it.enabled && it.nextFire != null }
            .minByOrNull { it.nextFire!! }

        val remaining = soonest?.nextFire?.let { Duration.between(now, it) }
        return State(
            rows = rows,
            nextPrayer = soonest?.prayer,
            nextFire = soonest?.nextFire,
            timeRemaining = remaining?.takeIf { !it.isNegative },
        )
    }

    /** Format a Duration as "H:MM:SS" or "MM:SS" for the countdown. */
    fun formatCountdown(duration: Duration): String {
        val total = duration.seconds.coerceAtLeast(0)
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) {
            "%d:%02d:%02d".format(h, m, s)
        } else {
            "%02d:%02d".format(m, s)
        }
    }
}
