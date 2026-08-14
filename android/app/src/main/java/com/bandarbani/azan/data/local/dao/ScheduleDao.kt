package com.bandarbani.azan.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.bandarbani.azan.data.local.entity.PrayerTimeEntity
import com.bandarbani.azan.data.local.entity.ScheduleEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ScheduleDao {

    @Query("SELECT * FROM schedule WHERE id = :id LIMIT 1")
    fun observeSchedule(id: Int = ScheduleEntity.SINGLE_ID): Flow<ScheduleEntity?>

    @Query("SELECT * FROM schedule WHERE id = :id LIMIT 1")
    suspend fun getSchedule(id: Int = ScheduleEntity.SINGLE_ID): ScheduleEntity?

    @Query("SELECT * FROM prayer_time ORDER BY prayer ASC")
    fun observePrayerTimes(): Flow<List<PrayerTimeEntity>>

    @Query("SELECT * FROM prayer_time ORDER BY prayer ASC")
    suspend fun getPrayerTimes(): List<PrayerTimeEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSchedule(schedule: ScheduleEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPrayerTimes(prayers: List<PrayerTimeEntity>)

    @Query("DELETE FROM prayer_time")
    suspend fun clearPrayerTimes()

    /**
     * Atomically replace the schedule + its prayer rows so the store never has a partially-applied
     * schedule (important: alarms are computed from this table).
     */
    @Transaction
    suspend fun replaceSchedule(schedule: ScheduleEntity, prayers: List<PrayerTimeEntity>) {
        upsertSchedule(schedule)
        clearPrayerTimes()
        upsertPrayerTimes(prayers)
    }
}
