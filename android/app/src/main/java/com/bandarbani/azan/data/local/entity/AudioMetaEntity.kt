package com.bandarbani.azan.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Audio metadata + local file pointer for ONE audio in the library. Keyed by audio [version] (the
 * server assigns a unique monotonic version per uploaded clip, used by GET /audio/:version/file).
 *
 * Many rows coexist — one per Azan clip or announcement audio the payload references. A row is
 * playable only once [validated] = true (file downloaded AND sha256 + size verified). Playback code
 * must never read a row whose [localPath] is null or [validated] is false.
 */
@Entity(tableName = "audio_meta")
data class AudioMetaEntity(
    @PrimaryKey val version: Int,
    /** Remote audio id from the payload (opaque; referenced by prayers / defaultAudioId). */
    val id: String,
    /** Human label (e.g. "Makkah Azan"), if the server provided one. */
    val label: String?,
    /** Relative download path (e.g. "audio/3/file") — absolute URL = API_BASE_URL + this. */
    val path: String,
    val checksumSha256: String,
    val sizeBytes: Long,
    val mimeType: String,
    /** Absolute path to the verified local file, or null until downloaded & verified. */
    val localPath: String?,
    /** True only when [localPath] exists and its checksum matched. */
    val validated: Boolean,
    val updatedAt: Long,
)
