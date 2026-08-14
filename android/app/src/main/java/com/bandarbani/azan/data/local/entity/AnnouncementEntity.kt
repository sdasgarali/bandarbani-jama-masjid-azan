package com.bandarbani.azan.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A future admin-scheduled announcement (one-off broadcast). Its audio lives in [AudioMetaEntity]
 * keyed by [audioVersion]; the scheduler arms an exact alarm at [scheduledAtEpochMillis] and the
 * receiver plays that audio once (no re-arm).
 *
 * We store the absolute instant as epoch millis (parsed from the payload's ISO `scheduledAt`) so no
 * Room type converter is needed and comparisons are trivial.
 */
@Entity(tableName = "announcement")
data class AnnouncementEntity(
    @PrimaryKey val id: String,
    val label: String?,
    /** Absolute fire instant (UTC) as epoch millis. */
    val scheduledAtEpochMillis: Long,
    val enabled: Boolean,
    /** The [AudioMetaEntity.version] of this announcement's audio. */
    val audioVersion: Int,
)
