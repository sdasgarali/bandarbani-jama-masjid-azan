package com.bandarbani.azan.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Audio metadata + local file pointer. Keyed by audio [version]. Only the row whose file has been
 * downloaded and checksum-verified has [isActive] = true; playback always reads the active row.
 */
@Entity(tableName = "audio_meta")
data class AudioMetaEntity(
    @PrimaryKey val version: Int,
    /** Remote id from the payload (opaque). */
    val remoteId: String,
    /** Relative download path, e.g. "/api/v1/audio/3/file". */
    val url: String,
    val checksumSha256: String,
    val sizeBytes: Long,
    val mimeType: String,
    /** Absolute path to the verified local file, or null until downloaded. */
    val localPath: String?,
    /** True only when localPath exists and checksum matched. */
    val isActive: Boolean,
    val updatedAt: Long,
)
