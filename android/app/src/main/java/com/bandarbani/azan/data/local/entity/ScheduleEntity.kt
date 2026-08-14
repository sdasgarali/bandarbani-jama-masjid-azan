package com.bandarbani.azan.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Single-row table holding the currently-active published schedule metadata.
 * We keep exactly one schedule for the MVP (id = 1). Prayer times live in [PrayerTimeEntity].
 */
@Entity(tableName = "schedule")
data class ScheduleEntity(
    @PrimaryKey val id: Int = SINGLE_ID,
    /** Monotonic published version from the backend (used as the ETag). */
    val version: Int,
    /** IANA timezone the wall-clock prayer times are expressed in, e.g. "Asia/Dhaka". */
    val timezone: String,
    /** ISO-8601 instant string from the payload's publishedAt. */
    val publishedAt: String,
    /** Fallback Azan audio id for prayers without a custom audioId. Null ⇒ no default assigned. */
    val defaultAudioId: String? = null,
    /** When this device last successfully applied this schedule (epoch millis). */
    val updatedAt: Long,
) {
    companion object {
        const val SINGLE_ID = 1
    }
}
