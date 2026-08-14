package com.bandarbani.azan.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.bandarbani.azan.data.local.entity.AudioMetaEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AudioDao {

    @Query("SELECT * FROM audio_meta WHERE isActive = 1 LIMIT 1")
    suspend fun getActive(): AudioMetaEntity?

    @Query("SELECT * FROM audio_meta WHERE isActive = 1 LIMIT 1")
    fun observeActive(): Flow<AudioMetaEntity?>

    @Query("SELECT * FROM audio_meta WHERE version = :version LIMIT 1")
    suspend fun getByVersion(version: Int): AudioMetaEntity?

    @Query("SELECT * FROM audio_meta")
    suspend fun getAll(): List<AudioMetaEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(meta: AudioMetaEntity)

    @Query("UPDATE audio_meta SET isActive = 0")
    suspend fun clearActiveFlags()

    @Query("DELETE FROM audio_meta WHERE version = :version")
    suspend fun deleteByVersion(version: Int)

    /**
     * Promote [version] to the active audio (exactly one active row) after its file is verified.
     */
    @Transaction
    suspend fun promoteActive(meta: AudioMetaEntity) {
        clearActiveFlags()
        upsert(meta.copy(isActive = true))
    }
}
