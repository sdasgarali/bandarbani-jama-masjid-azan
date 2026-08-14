package com.bandarbani.azan.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.bandarbani.azan.data.local.entity.SyncStateEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncStateDao {

    @Query("SELECT * FROM sync_state WHERE id = :id LIMIT 1")
    suspend fun get(id: Int = SyncStateEntity.SINGLE_ID): SyncStateEntity?

    @Query("SELECT * FROM sync_state WHERE id = :id LIMIT 1")
    fun observe(id: Int = SyncStateEntity.SINGLE_ID): Flow<SyncStateEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(state: SyncStateEntity)
}
