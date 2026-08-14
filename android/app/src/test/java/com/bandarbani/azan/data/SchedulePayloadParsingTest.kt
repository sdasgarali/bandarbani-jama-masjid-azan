package com.bandarbani.azan.data

import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.data.remote.dto.SchedulePayloadDto
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Verifies the app parses the EXACT published payload shape from DATABASE.md.
 */
class SchedulePayloadParsingTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    private val samplePayload = """
    {
      "version": 7,
      "timezone": "Asia/Dhaka",
      "prayers": [
        {"prayer":"FAJR","time":"04:18","enabled":true,"audioEnabled":true,"notificationEnabled":true},
        {"prayer":"DHUHR","time":"12:05","enabled":true,"audioEnabled":true,"notificationEnabled":true},
        {"prayer":"ASR","time":"16:38","enabled":true,"audioEnabled":true,"notificationEnabled":true},
        {"prayer":"MAGHRIB","time":"18:21","enabled":true,"audioEnabled":true,"notificationEnabled":true},
        {"prayer":"ISHA","time":"19:42","enabled":false,"audioEnabled":true,"notificationEnabled":true}
      ],
      "audio": {
        "id":"abc123", "version":3, "url":"/api/v1/audio/3/file",
        "checksumSha256":"deadbeef", "sizeBytes":123456, "mimeType":"audio/mpeg"
      },
      "publishedAt":"2026-08-14T09:00:00.000Z"
    }
    """.trimIndent()

    @Test
    fun `parses full payload correctly`() {
        val dto = json.decodeFromString<SchedulePayloadDto>(samplePayload)
        assertThat(dto.version).isEqualTo(7)
        assertThat(dto.timezone).isEqualTo("Asia/Dhaka")
        assertThat(dto.prayers).hasSize(5)
        assertThat(dto.publishedAt).isEqualTo("2026-08-14T09:00:00.000Z")

        val fajr = dto.prayers.first { it.prayer == "FAJR" }
        assertThat(fajr.time).isEqualTo("04:18")
        assertThat(Prayer.fromApi(fajr.prayer)).isEqualTo(Prayer.FAJR)

        val isha = dto.prayers.first { it.prayer == "ISHA" }
        assertThat(isha.enabled).isFalse()
    }

    @Test
    fun `parses audio metadata`() {
        val dto = json.decodeFromString<SchedulePayloadDto>(samplePayload)
        val audio = dto.audio!!
        assertThat(audio.version).isEqualTo(3)
        assertThat(audio.url).isEqualTo("/api/v1/audio/3/file")
        assertThat(audio.checksumSha256).isEqualTo("deadbeef")
        assertThat(audio.sizeBytes).isEqualTo(123456L)
        assertThat(audio.mimeType).isEqualTo("audio/mpeg")
    }

    @Test
    fun `tolerates missing audio and default toggles`() {
        val minimal = """
        {
          "version": 1,
          "timezone": "Asia/Dhaka",
          "prayers": [ {"prayer":"FAJR","time":"05:00"} ],
          "publishedAt":"2026-01-01T00:00:00.000Z"
        }
        """.trimIndent()
        val dto = json.decodeFromString<SchedulePayloadDto>(minimal)
        assertThat(dto.audio).isNull()
        // defaults
        assertThat(dto.prayers.first().enabled).isTrue()
        assertThat(dto.prayers.first().audioEnabled).isTrue()
    }

    @Test
    fun `ignores unknown fields`() {
        val withExtra = """
        {
          "version": 2, "timezone":"UTC", "surprise":"x",
          "prayers": [ {"prayer":"ISHA","time":"20:00","extraFlag":true} ],
          "publishedAt":"2026-01-01T00:00:00.000Z"
        }
        """.trimIndent()
        val dto = json.decodeFromString<SchedulePayloadDto>(withExtra)
        assertThat(dto.version).isEqualTo(2)
        assertThat(dto.prayers.first().prayer).isEqualTo("ISHA")
    }
}
