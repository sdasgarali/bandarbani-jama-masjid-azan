package com.bandarbani.azan.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.bandarbani.azan.data.local.entity.AudioMetaEntity

@Dao
interface AudioDao {

    @Query("SELECT * FROM audio_meta WHERE version = :version LIMIT 1")
    suspend fun getByVersion(version: Int): AudioMetaEntity?

    @Query("SELECT * FROM audio_meta WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): AudioMetaEntity?

    @Query("SELECT * FROM audio_meta")
    suspend fun getAll(): List<AudioMetaEntity>

    /** Any validated (playable) audio — used as a last-resort fallback (e.g. TEST_AZAN). */
    @Query("SELECT * FROM audio_meta WHERE validated = 1 AND localPath IS NOT NULL ORDER BY version DESC LIMIT 1")
    suspend fun getAnyValidated(): AudioMetaEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(meta: AudioMetaEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(metas: List<AudioMetaEntity>)

    @Query("UPDATE audio_meta SET localPath = :localPath, validated = 1, updatedAt = :updatedAt WHERE version = :version")
    suspend fun markValidated(version: Int, localPath: String, updatedAt: Long)

    @Query("DELETE FROM audio_meta WHERE version = :version")
    suspend fun deleteByVersion(version: Int)
}
