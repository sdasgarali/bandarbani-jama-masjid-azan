package com.bandarbani.azan.data

import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.data.remote.dto.SchedulePayloadDto
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Verifies the app parses the EXACT published payload shape from DATABASE.md
 * (§"Published payload shape"): per-prayer audioId, top-level defaultAudioId, the audios[] library,
 * and announcements[] with inline audio.
 */
class SchedulePayloadParsingTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    private val samplePayload = """
    {
      "version": 8,
      "timezone": "Asia/Dhaka",
      "defaultAudioId": "a1",
      "prayers": [
        {"prayer":"FAJR","time":"04:18","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":"a2"},
        {"prayer":"DHUHR","time":"12:05","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":null},
        {"prayer":"ASR","time":"16:38","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":null},
        {"prayer":"MAGHRIB","time":"18:21","enabled":true,"audioEnabled":true,"notificationEnabled":true,"audioId":"a2"},
        {"prayer":"ISHA","time":"19:42","enabled":false,"audioEnabled":true,"notificationEnabled":true,"audioId":null}
      ],
      "audios": [
        {"id":"a1","label":"Default Azan","version":3,"path":"audio/3/file","checksumSha256":"aa","sizeBytes":123456,"mimeType":"audio/mpeg"},
        {"id":"a2","label":"Makkah Azan","version":5,"path":"audio/5/file","checksumSha256":"bb","sizeBytes":222333,"mimeType":"audio/mpeg"}
      ],
      "announcements": [
        {"id":"n1","label":"Eid Jama'at notice","scheduledAt":"2026-08-20T03:00:00.000Z","enabled":true,
         "audio":{"id":"a9","label":"Eid notice","version":7,"path":"audio/7/file","checksumSha256":"cc","sizeBytes":98765,"mimeType":"audio/mpeg"}}
      ],
      "publishedAt":"2026-08-14T09:00:00.000Z"
    }
    """.trimIndent()

    @Test
    fun `parses full payload correctly`() {
        val dto = json.decodeFromString<SchedulePayloadDto>(samplePayload)
        assertThat(dto.version).isEqualTo(8)
        assertThat(dto.timezone).isEqualTo("Asia/Dhaka")
        assertThat(dto.defaultAudioId).isEqualTo("a1")
        assertThat(dto.prayers).hasSize(5)
        assertThat(dto.publishedAt).isEqualTo("2026-08-14T09:00:00.000Z")

        val fajr = dto.prayers.first { it.prayer == "FAJR" }
        assertThat(fajr.time).isEqualTo("04:18")
        assertThat(fajr.audioId).isEqualTo("a2")
        assertThat(Prayer.fromApi(fajr.prayer)).isEqualTo(Prayer.FAJR)

        val dhuhr = dto.prayers.first { it.prayer == "DHUHR" }
        assertThat(dhuhr.audioId).isNull()

        val isha = dto.prayers.first { it.prayer == "ISHA" }
        assertThat(isha.enabled).isFalse()
    }

    @Test
    fun `parses audio library`() {
        val dto = json.decodeFromString<SchedulePayloadDto>(samplePayload)
        assertThat(dto.audios).hasSize(2)
        val a2 = dto.audios.first { it.id == "a2" }
        assertThat(a2.version).isEqualTo(5)
        assertThat(a2.path).isEqualTo("audio/5/file")
        assertThat(a2.downloadRef).isEqualTo("audio/5/file")
        assertThat(a2.checksumSha256).isEqualTo("bb")
        assertThat(a2.sizeBytes).isEqualTo(222333L)
        assertThat(a2.mimeType).isEqualTo("audio/mpeg")
        assertThat(a2.label).isEqualTo("Makkah Azan")
    }

    @Test
    fun `parses announcements with inline audio`() {
        val dto = json.decodeFromString<SchedulePayloadDto>(samplePayload)
        assertThat(dto.announcements).hasSize(1)
        val n1 = dto.announcements.first()
        assertThat(n1.id).isEqualTo("n1")
        assertThat(n1.enabled).isTrue()
        assertThat(n1.scheduledAt).isEqualTo("2026-08-20T03:00:00.000Z")
        assertThat(n1.audio.version).isEqualTo(7)
        assertThat(n1.audio.downloadRef).isEqualTo("audio/7/file")
    }

    @Test
    fun `tolerates missing library, announcements, default and per-prayer audio`() {
        val minimal = """
        {
          "version": 1,
          "timezone": "Asia/Dhaka",
          "prayers": [ {"prayer":"FAJR","time":"05:00"} ],
          "publishedAt":"2026-01-01T00:00:00.000Z"
        }
        """.trimIndent()
        val dto = json.decodeFromString<SchedulePayloadDto>(minimal)
        assertThat(dto.defaultAudioId).isNull()
        assertThat(dto.audios).isEmpty()
        assertThat(dto.announcements).isEmpty()
        // defaults
        assertThat(dto.prayers.first().enabled).isTrue()
        assertThat(dto.prayers.first().audioEnabled).isTrue()
        assertThat(dto.prayers.first().audioId).isNull()
    }

    @Test
    fun `accepts legacy url alias for audio path`() {
        val legacy = """
        {
          "version": 2, "timezone":"UTC",
          "prayers": [ {"prayer":"ISHA","time":"20:00"} ],
          "audios": [
            {"id":"x","version":3,"url":"/api/v1/audio/3/file","checksumSha256":"dd","sizeBytes":10,"mimeType":"audio/mpeg"}
          ],
          "publishedAt":"2026-01-01T00:00:00.000Z"
        }
        """.trimIndent()
        val dto = json.decodeFromString<SchedulePayloadDto>(legacy)
        val a = dto.audios.first()
        assertThat(a.path).isNull()
        assertThat(a.downloadRef).isEqualTo("/api/v1/audio/3/file")
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
