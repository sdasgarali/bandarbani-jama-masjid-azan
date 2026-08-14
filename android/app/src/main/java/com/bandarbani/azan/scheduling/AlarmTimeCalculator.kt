package com.bandarbani.azan.scheduling

import com.bandarbani.azan.core.Prayer
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * PURE Kotlin (no Android deps) so it is fully unit-testable and deterministic.
 *
 * Computes the next fire instant for a prayer given its wall-clock "HH:mm", the schedule's IANA
 * timezone, and a reference "now". All DST/date rollover is handled by java.time's ZonedDateTime
 * arithmetic in the schedule timezone.
 */
object AlarmTimeCalculator {

    private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    data class NextFire(
        val prayer: Prayer,
        val instant: Instant,
        /** Local date (in schedule tz) the fire lands on — used for the deterministic request code. */
        val localDate: LocalDate,
    )

    /**
     * Parse "HH:mm". Returns null on malformed input rather than throwing (defensive against bad
     * payloads).
     */
    fun parseTimeOrNull(hhmm: String): LocalTime? = try {
        LocalTime.parse(hhmm.trim(), TIME_FORMAT)
    } catch (_: Exception) {
        null
    }

    /**
     * Next fire instant for a single prayer.
     *
     * Rule: take today's wall-clock time in [zone]; if that instant is at or before [now], roll to
     * the next day. "At or before" (not strictly before) means a prayer whose minute exactly equals
     * now is scheduled for tomorrow — avoids an immediate double-fire on reschedule.
     *
     * DST: constructing ZonedDateTime resolves gaps/overlaps automatically (java.time picks the
     * valid offset), so a 02:30 during a spring-forward gap shifts forward correctly.
     */
    fun nextFireFor(
        prayer: Prayer,
        hhmm: String,
        zone: ZoneId,
        now: Instant,
    ): NextFire? {
        val time = parseTimeOrNull(hhmm) ?: return null
        val nowZdt = now.atZone(zone)
        val today = nowZdt.toLocalDate()

        val todayFire = zonedFireInstant(today, time, zone)
        return if (!todayFire.toInstant().isAfter(now)) {
            val tomorrow = today.plusDays(1)
            val tomorrowFire = zonedFireInstant(tomorrow, time, zone)
            NextFire(prayer, tomorrowFire.toInstant(), tomorrow)
        } else {
            NextFire(prayer, todayFire.toInstant(), today)
        }
    }

    /**
     * Compute next fires for all supplied prayers, sorted ascending by instant. Prayers with
     * malformed times are skipped. Input map preserves per-prayer wall time.
     */
    fun nextFires(
        prayerTimes: List<Pair<Prayer, String>>,
        zone: ZoneId,
        now: Instant,
    ): List<NextFire> =
        prayerTimes
            .mapNotNull { (prayer, hhmm) -> nextFireFor(prayer, hhmm, zone, now) }
            .sortedBy { it.instant }

    /**
     * Build a ZonedDateTime for a wall-clock date+time in a zone, resolving DST edge cases.
     * `ZonedDateTime.of` uses the earlier offset for overlaps and shifts forward for gaps.
     */
    private fun zonedFireInstant(date: LocalDate, time: LocalTime, zone: ZoneId): ZonedDateTime =
        ZonedDateTime.of(date, time, zone)
}
