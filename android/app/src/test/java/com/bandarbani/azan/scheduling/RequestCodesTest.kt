package com.bandarbani.azan.scheduling

import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.core.Prayer
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.LocalDate

class RequestCodesTest {

    private val base = Constants.ALARM_REQUEST_BASE

    @Test
    fun `same prayer same date yields same code - idempotent`() {
        val date = LocalDate.of(2026, 8, 14)
        val a = RequestCodes.forPrayerOnDate(Prayer.FAJR, date, base)
        val b = RequestCodes.forPrayerOnDate(Prayer.FAJR, date, base)
        assertThat(a).isEqualTo(b)
    }

    @Test
    fun `different prayers on same date get distinct codes`() {
        val date = LocalDate.of(2026, 8, 14)
        val codes = Prayer.entries.map { RequestCodes.forPrayerOnDate(it, date, base) }
        assertThat(codes.toSet()).hasSize(Prayer.entries.size)
    }

    @Test
    fun `today and tomorrow same prayer get distinct codes for rolling window`() {
        val today = LocalDate.of(2026, 8, 14)
        val tomorrow = today.plusDays(1)
        val a = RequestCodes.forPrayerOnDate(Prayer.FAJR, today, base)
        val b = RequestCodes.forPrayerOnDate(Prayer.FAJR, tomorrow, base)
        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `code space stays within two-day bucket bounds`() {
        // 2 buckets * 5 prayers = 10 distinct codes in [base, base+9].
        val codes = mutableSetOf<Int>()
        for (dayOffset in 0..6) {
            val date = LocalDate.of(2026, 8, 14).plusDays(dayOffset.toLong())
            Prayer.entries.forEach { codes += RequestCodes.forPrayerOnDate(it, date, base) }
        }
        assertThat(codes.min()).isAtLeast(base)
        assertThat(codes.max()).isAtMost(base + 9)
    }

    @Test
    fun `forEpochDay matches forPrayerOnDate`() {
        val date = LocalDate.of(2026, 8, 14)
        val byDate = RequestCodes.forPrayerOnDate(Prayer.ASR, date, base)
        val byEpoch = RequestCodes.forEpochDay(Prayer.ASR.ordinal, date.toEpochDay(), base)
        assertThat(byDate).isEqualTo(byEpoch)
    }

    private val annBase = Constants.ANNOUNCEMENT_REQUEST_BASE

    @Test
    fun `announcement code is deterministic for same inputs`() {
        val a = RequestCodes.announcement("n1", 7, 1_760_000_000_000L, annBase)
        val b = RequestCodes.announcement("n1", 7, 1_760_000_000_000L, annBase)
        assertThat(a).isEqualTo(b)
    }

    @Test
    fun `different announcements get distinct codes`() {
        val a = RequestCodes.announcement("n1", 7, 1_760_000_000_000L, annBase)
        val b = RequestCodes.announcement("n2", 7, 1_760_000_000_000L, annBase)
        val c = RequestCodes.announcement("n1", 8, 1_760_000_000_000L, annBase)
        val d = RequestCodes.announcement("n1", 7, 1_760_000_000_001L, annBase)
        assertThat(setOf(a, b, c, d)).hasSize(4)
    }

    @Test
    fun `announcement codes never collide with the prayer code space`() {
        // Prayer space is [base, base+9]. Announcement space starts far above and stays above it.
        val prayerMax = base + 9
        for (i in 0 until 500) {
            val code = RequestCodes.announcement("id$i", i % 20, 1_700_000_000_000L + i, annBase)
            assertThat(code).isAtLeast(annBase)
            assertThat(code).isGreaterThan(prayerMax)
        }
    }
}
