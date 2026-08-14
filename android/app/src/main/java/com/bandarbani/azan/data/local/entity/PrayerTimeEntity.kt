package com.bandarbani.azan.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.bandarbani.azan.core.Prayer

/**
 * One row per prayer for the active schedule. Primary key is the prayer name so re-applying a
 * schedule replaces (never duplicates) rows.
 */
@Entity(tableName = "prayer_time")
data class PrayerTimeEntity(
    @PrimaryKey val prayer: Prayer,
    /** Wall-clock time in the schedule timezone, "HH:mm" 24h. */
    val time: String,
    val enabled: Boolean,
    val audioEnabled: Boolean,
    val notificationEnabled: Boolean,
)
