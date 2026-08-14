package com.bandarbani.azan.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors the published payload shape documented in DATABASE.md (ScheduleVersion.payload) and
 * returned by GET /api/v1/schedule/current. Field names match the JSON exactly.
 *
 * NOTE: the endpoint wraps success bodies as `{ "data": ... }` (see API.md). GET /schedule/current
 * returns the payload directly as `data`, so we unwrap via [ApiEnvelope] in the API layer.
 *
 * Per-prayer audio & announcements (DATABASE.md §"Published payload shape"):
 *  - Each prayer carries an optional [PrayerDto.audioId]; the top-level [SchedulePayloadDto.defaultAudioId]
 *    is the fallback. Resolution: prayer.audioId → defaultAudioId → none.
 *  - [SchedulePayloadDto.audios] is the deduped library of every audio the app must download & cache.
 *  - [SchedulePayloadDto.announcements] are future one-off broadcasts, each with their own inline audio.
 * All new fields default so older/minimal payloads still parse (JSON is configured with
 * ignoreUnknownKeys + explicitNulls=false).
 */
@Serializable
data class SchedulePayloadDto(
    val version: Int,
    val timezone: String,
    val prayers: List<PrayerDto> = emptyList(),
    /** The fallback Azan audio id used when a prayer has no custom [PrayerDto.audioId]. May be null. */
    val defaultAudioId: String? = null,
    /** Deduped library of every audio referenced by a prayer or the default. */
    val audios: List<AudioDto> = emptyList(),
    /** Future scheduled announcements (one-off broadcasts). */
    val announcements: List<AnnouncementDto> = emptyList(),
    val publishedAt: String,
)

@Serializable
data class PrayerDto(
    val prayer: String,
    val time: String,
    val enabled: Boolean = true,
    val audioEnabled: Boolean = true,
    val notificationEnabled: Boolean = true,
    /** This prayer's custom Azan audio id; null ⇒ use [SchedulePayloadDto.defaultAudioId]. */
    val audioId: String? = null,
)

/**
 * A single audio entry in the library. `path` is RELATIVE (e.g. "audio/3/file"); the app builds the
 * absolute download URL from its own API base (BuildConfig.API_BASE_URL + path).
 *
 * `url` is accepted as a legacy alias for older payloads that emitted an absolute-ish `url` field.
 * Prefer [downloadRef] to obtain the value to hand to the downloader.
 */
@Serializable
data class AudioDto(
    val id: String,
    val label: String? = null,
    val version: Int,
    val path: String? = null,
    /** Legacy alias for [path] used by pre-library payloads. */
    val url: String? = null,
    val checksumSha256: String,
    val sizeBytes: Long,
    val mimeType: String,
) {
    /** The relative (or legacy) reference to feed the audio downloader; may be empty if malformed. */
    val downloadRef: String
        get() = (path ?: url).orEmpty()
}

/**
 * An admin-scheduled one-off broadcast. `scheduledAt` is an absolute ISO-8601 instant (UTC). The app
 * arms an exact alarm at that instant and plays [audio] once.
 */
@Serializable
data class AnnouncementDto(
    val id: String,
    val label: String? = null,
    @SerialName("scheduledAt") val scheduledAt: String,
    val enabled: Boolean = true,
    val audio: AudioDto,
)

/** Metadata endpoint GET /audio/:version/meta. Superset of [AudioDto]. */
@Serializable
data class AudioMetaDto(
    val id: String,
    val version: Int,
    val path: String? = null,
    val url: String? = null,
    val checksumSha256: String,
    val sizeBytes: Long,
    val mimeType: String,
    @SerialName("filename") val filename: String? = null,
    @SerialName("durationMs") val durationMs: Long? = null,
)
