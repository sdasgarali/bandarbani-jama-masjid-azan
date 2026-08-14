package com.bandarbani.azan.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors the published payload shape documented in DATABASE.md (ScheduleVersion.payload) and
 * returned by GET /api/v1/schedule/current. Field names match the JSON exactly.
 *
 * NOTE: the endpoint wraps success bodies as `{ "data": ... }` (see API.md). GET /schedule/current
 * returns the payload directly as `data`, so we unwrap via [ApiEnvelope] in the API layer.
 */
@Serializable
data class SchedulePayloadDto(
    val version: Int,
    val timezone: String,
    val prayers: List<PrayerDto>,
    val audio: AudioDto? = null,
    val publishedAt: String,
)

@Serializable
data class PrayerDto(
    val prayer: String,
    val time: String,
    val enabled: Boolean = true,
    val audioEnabled: Boolean = true,
    val notificationEnabled: Boolean = true,
)

@Serializable
data class AudioDto(
    val id: String,
    val version: Int,
    val url: String,
    val checksumSha256: String,
    val sizeBytes: Long,
    val mimeType: String,
)

/** Metadata endpoint GET /audio/:version/meta. Superset of [AudioDto]. */
@Serializable
data class AudioMetaDto(
    val id: String,
    val version: Int,
    val url: String? = null,
    val checksumSha256: String,
    val sizeBytes: Long,
    val mimeType: String,
    @SerialName("filename") val filename: String? = null,
    @SerialName("durationMs") val durationMs: Long? = null,
)
