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
}
