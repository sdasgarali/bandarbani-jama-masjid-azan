package com.bandarbani.azan.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.bandarbani.azan.data.local.dao.AudioDao
import com.bandarbani.azan.data.local.dao.ScheduleDao
import com.bandarbani.azan.data.local.dao.SyncStateDao
import com.bandarbani.azan.data.local.entity.AudioMetaEntity
import com.bandarbani.azan.data.local.entity.PrayerTimeEntity
import com.bandarbani.azan.data.local.entity.ScheduleEntity
import com.bandarbani.azan.data.local.entity.SyncStateEntity

@Database(
    entities = [
        ScheduleEntity::class,
        PrayerTimeEntity::class,
        AudioMetaEntity::class,
        SyncStateEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun scheduleDao(): ScheduleDao
    abstract fun audioDao(): AudioDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "bandarbani_azan.db"
    }
}
