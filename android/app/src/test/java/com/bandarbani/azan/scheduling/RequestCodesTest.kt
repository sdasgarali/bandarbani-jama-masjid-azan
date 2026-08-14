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
}
