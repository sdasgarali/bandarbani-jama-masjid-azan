package com.bandarbani.azan.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.bandarbani.azan.data.local.entity.AnnouncementEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AnnouncementDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(announcements: List<AnnouncementEntity>)

    /** Observe all enabled announcements ordered by fire instant (UI filters to the future). */
    @Query("SELECT * FROM announcement WHERE enabled = 1 ORDER BY scheduledAtEpochMillis ASC")
    fun observeEnabled(): Flow<List<AnnouncementEntity>>

    @Query("SELECT * FROM announcement")
    suspend fun getAll(): List<AnnouncementEntity>

    @Query("SELECT * FROM announcement WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): AnnouncementEntity?

    /** Enabled announcements whose fire instant is strictly in the future. */
    @Query("SELECT * FROM announcement WHERE enabled = 1 AND scheduledAtEpochMillis > :nowMillis ORDER BY scheduledAtEpochMillis ASC")
    suspend fun getEnabledFuture(nowMillis: Long): List<AnnouncementEntity>

    @Query("DELETE FROM announcement")
    suspend fun clear()

    /** Atomically swap the announcement set so the store is never partially applied. */
    @Transaction
    suspend fun replaceAll(announcements: List<AnnouncementEntity>) {
        clear()
        upsertAll(announcements)
    }
}
