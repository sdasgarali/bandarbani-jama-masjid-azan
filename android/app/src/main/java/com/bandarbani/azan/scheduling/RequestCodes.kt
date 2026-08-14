package com.bandarbani.azan.scheduling

import com.bandarbani.azan.core.Prayer
import java.time.LocalDate

/**
 * Deterministic alarm request codes. PURE Kotlin so it is unit-tested for duplicate prevention.
 *
 * A request code is a stable function of (prayer.ordinal, epochDay). Re-running rescheduleAll with
 * the same inputs produces the SAME PendingIntent request code, so arming it again replaces the
 * existing alarm instead of creating a duplicate.
 *
 * We fold the epochDay into the code so that "today's Fajr" and "tomorrow's Fajr" get distinct
 * codes (they can be armed as separate rolling-window alarms without clobbering each other), while
 * still being fully deterministic.
 */
object RequestCodes {

    private const val PRAYER_COUNT = 5

    /** requestCode = base + prayer.ordinal + (epochDay mod DAY_SPAN) * PRAYER_COUNT. */
    private const val DAY_SPAN = 2 // rolling window: today + tomorrow

    fun forPrayerOnDate(prayer: Prayer, date: LocalDate, base: Int): Int {
        val dayBucket = Math.floorMod(date.toEpochDay(), DAY_SPAN.toLong()).toInt()
        return base + dayBucket * PRAYER_COUNT + prayer.ordinal
    }

    fun forEpochDay(prayerOrdinal: Int, epochDay: Long, base: Int): Int {
        val dayBucket = Math.floorMod(epochDay, DAY_SPAN.toLong()).toInt()
        return base + dayBucket * PRAYER_COUNT + prayerOrdinal
    }

    /**
     * Deterministic, distinct request code for a scheduled announcement, in a SEPARATE numeric range
     * from prayers so the two can never collide. The code is a stable function of the announcement's
     * identity (id + audioVersion + fire instant): re-running rescheduleAll with the same inputs
     * yields the SAME code, so arming replaces (never duplicates) the alarm; two different
     * announcements yield (with overwhelming probability) different codes.
     *
     * [base] must be far above the prayer space [prayerBase, prayerBase+9] — see
     * Constants.ANNOUNCEMENT_REQUEST_BASE.
     */
    private const val ANNOUNCEMENT_SPAN = 100_000

    fun announcement(id: String, audioVersion: Int, epochMillis: Long, base: Int): Int {
        var h = 17
        h = 31 * h + id.hashCode()
        h = 31 * h + audioVersion
        h = 31 * h + (epochMillis xor (epochMillis ushr 32)).toInt()
        val offset = Math.floorMod(h, ANNOUNCEMENT_SPAN)
        return base + offset
    }
}
