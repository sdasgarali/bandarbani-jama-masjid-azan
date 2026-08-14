package com.bandarbani.azan.domain

import com.bandarbani.azan.core.Prayer
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime

class PrayerScheduleViewTest {

    private val dhaka = ZoneId.of("Asia/Dhaka")

    private fun now(h: Int, mi: Int) =
        ZonedDateTime.of(2026, 8, 14, h, mi, 0, 0, dhaka).toInstant()

    private val prayers = listOf(
        Triple(Prayer.FAJR, "04:18", true),
        Triple(Prayer.DHUHR, "12:05", true),
        Triple(Prayer.ASR, "16:38", true),
        Triple(Prayer.MAGHRIB, "18:21", true),
        Triple(Prayer.ISHA, "19:42", true),
    )

    @Test
    fun `identifies the correct next prayer`() {
        val state = PrayerScheduleView.compute(prayers, dhaka, now(13, 0)) // after Dhuhr
        assertThat(state.nextPrayer).isEqualTo(Prayer.ASR)
    }

    @Test
    fun `disabled prayer is skipped as next`() {
        val custom = prayers.map {
            if (it.first == Prayer.ASR) it.copy(third = false) else it
        }
        val state = PrayerScheduleView.compute(custom, dhaka, now(13, 0))
        assertThat(state.nextPrayer).isEqualTo(Prayer.MAGHRIB)
    }

    @Test
    fun `time remaining is positive and reasonable`() {
        val state = PrayerScheduleView.compute(prayers, dhaka, now(16, 0)) // 38 min to Asr 16:38
        assertThat(state.timeRemaining).isNotNull()
        assertThat(state.timeRemaining!!.toMinutes()).isEqualTo(38)
    }

    @Test
    fun `after isha next prayer wraps to tomorrow fajr`() {
        val state = PrayerScheduleView.compute(prayers, dhaka, now(20, 0))
        assertThat(state.nextPrayer).isEqualTo(Prayer.FAJR)
    }

    @Test
    fun `formatCountdown formats hours and minutes`() {
        assertThat(PrayerScheduleView.formatCountdown(Duration.ofSeconds(3661)))
            .isEqualTo("1:01:01")
        assertThat(PrayerScheduleView.formatCountdown(Duration.ofSeconds(65)))
            .isEqualTo("01:05")
        assertThat(PrayerScheduleView.formatCountdown(Duration.ofSeconds(-5)))
            .isEqualTo("00:00")
    }
}
