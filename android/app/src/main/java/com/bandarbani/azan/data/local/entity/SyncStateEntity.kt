package com.bandarbani.azan.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Single-row bookkeeping for sync + alarm arming. Survives process death so the UI can show
 * "last sync" and the scheduler can validate stale alarms.
 */
@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val id: Int = SINGLE_ID,
    /** ETag of the last successful /schedule/current fetch (== version string). Null if never. */
    val lastEtag: String?,
    /** Epoch millis of the last successful sync, or null. */
    val lastSyncAt: Long?,
    /** Last sync outcome message for UI display. */
    val lastSyncResult: String?,
    /** CSV of currently-armed alarm request codes, for idempotent cancellation. */
    val armedRequestCodes: String?,
) {
    companion object {
        const val SINGLE_ID = 1
    }
}
