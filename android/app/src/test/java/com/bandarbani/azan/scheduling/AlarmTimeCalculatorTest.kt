package com.bandarbani.azan.scheduling

import com.bandarbani.azan.core.Prayer
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class AlarmTimeCalculatorTest {

    private val dhaka = ZoneId.of("Asia/Dhaka") // UTC+6, no DST

    private fun instantAt(zone: ZoneId, y: Int, mo: Int, d: Int, h: Int, mi: Int): Instant =
        ZonedDateTime.of(y, mo, d, h, mi, 0, 0, zone).toInstant()

    @Test
    fun `fajr later today returns today instant`() {
        val now = instantAt(dhaka, 2026, 8, 14, 3, 0) // 03:00 local
        val fire = AlarmTimeCalculator.nextFireFor(Prayer.FAJR, "04:18", dhaka, now)
        assertThat(fire).isNotNull()
        val zoned = fire!!.instant.atZone(dhaka)
        assertThat(zoned.toLocalDate()).isEqualTo(LocalDate.of(2026, 8, 14))
        assertThat(zoned.hour).isEqualTo(4)
        assertThat(zoned.minute).isEqualTo(18)
        assertThat(fire.localDate).isEqualTo(LocalDate.of(2026, 8, 14))
    }

    @Test
    fun `prayer already passed today rolls to tomorrow`() {
        val now = instantAt(dhaka, 2026, 8, 14, 20, 0) // 20:00, after Isha 19:42
        val fire = AlarmTimeCalculator.nextFireFor(Prayer.ISHA, "19:42", dhaka, now)
        assertThat(fire).isNotNull()
        val zoned = fire!!.instant.atZone(dhaka)
        assertThat(zoned.toLocalDate()).isEqualTo(LocalDate.of(2026, 8, 15))
        assertThat(zoned.hour).isEqualTo(19)
        assertThat(zoned.minute).isEqualTo(42)
    }

    @Test
    fun `exact-now time is scheduled for tomorrow to avoid immediate double fire`() {
        val now = instantAt(dhaka, 2026, 8, 14, 12, 5) // exactly Dhuhr 12:05
        val fire = AlarmTimeCalculator.nextFireFor(Prayer.DHUHR, "12:05", dhaka, now)
        assertThat(fire!!.instant.atZone(dhaka).toLocalDate())
            .isEqualTo(LocalDate.of(2026, 8, 15))
    }

    @Test
    fun `malformed time returns null and is skipped in nextFires`() {
        val now = instantAt(dhaka, 2026, 8, 14, 3, 0)
        assertThat(AlarmTimeCalculator.nextFireFor(Prayer.FAJR, "99:99", dhaka, now)).isNull()

        val list = AlarmTimeCalculator.nextFires(
            listOf(Prayer.FAJR to "bad", Prayer.DHUHR to "12:05"),
            dhaka, now,
        )
        assertThat(list.map { it.prayer }).containsExactly(Prayer.DHUHR)
    }

    @Test
    fun `nextFires is sorted ascending by instant`() {
        val now = instantAt(dhaka, 2026, 8, 14, 5, 0)
        val list = AlarmTimeCalculator.nextFires(
            listOf(
                Prayer.ISHA to "19:42",
                Prayer.DHUHR to "12:05",
                Prayer.ASR to "16:38",
            ),
            dhaka, now,
        )
        assertThat(list.map { it.prayer })
            .containsExactly(Prayer.DHUHR, Prayer.ASR, Prayer.ISHA)
            .inOrder()
    }

    @Test
    fun `DST spring-forward is handled - New York`() {
        val ny = ZoneId.of("America/New_York")
        // 2026-03-08 is US spring-forward: 02:00 -> 03:00. now = 01:00 EST that day.
        val now = ZonedDateTime.of(2026, 3, 8, 1, 0, 0, 0, ny).toInstant()
        // A 06:30 prayer that day is unaffected by the gap and lands on a valid offset.
        val fire = AlarmTimeCalculator.nextFireFor(Prayer.FAJR, "06:30", ny, now)!!
        val zoned = fire.instant.atZone(ny)
        assertThat(zoned.toLocalDate()).isEqualTo(LocalDate.of(2026, 3, 8))
        assertThat(zoned.hour).isEqualTo(6)
        assertThat(zoned.minute).isEqualTo(30)
        // Confirm the resulting offset is the post-DST offset (-04:00, EDT).
        assertThat(zoned.offset.totalSeconds).isEqualTo(-4 * 3600)
    }

    @Test
    fun `timezone change recomputes wall-clock correctly`() {
        // Same wall-clock "18:21" resolves to different instants in different zones.
        val now = Instant.parse("2026-08-14T00:00:00Z")
        val dhakaFire = AlarmTimeCalculator.nextFireFor(Prayer.MAGHRIB, "18:21", dhaka, now)!!
        val kolkata = ZoneId.of("Asia/Kolkata") // UTC+5:30
        val kolkataFire = AlarmTimeCalculator.nextFireFor(Prayer.MAGHRIB, "18:21", kolkata, now)!!
        // Kolkata is 30 min behind Dhaka, so 18:21 Kolkata fires 30 min LATER in absolute time.
        val diffMinutes = (kolkataFire.instant.epochSecond - dhakaFire.instant.epochSecond) / 60
        assertThat(diffMinutes).isEqualTo(30)
    }
}
