package com.bandarbani.azan.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.bandarbani.azan.data.local.dao.AnnouncementDao
import com.bandarbani.azan.data.local.dao.AudioDao
import com.bandarbani.azan.data.local.dao.ScheduleDao
import com.bandarbani.azan.data.local.dao.SyncStateDao
import com.bandarbani.azan.data.local.entity.AnnouncementEntity
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
        AnnouncementEntity::class,
    ],
    // v2: per-prayer audio (PrayerTime.audioId, Schedule.defaultAudioId), audio library keyed by
    // version with a `validated` flag, and the new announcement table. This is a pure cache, so we
    // rely on fallbackToDestructiveMigration (see AppModule) — a re-sync repopulates everything.
    version = 2,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun scheduleDao(): ScheduleDao
    abstract fun audioDao(): AudioDao
    abstract fun syncStateDao(): SyncStateDao
    abstract fun announcementDao(): AnnouncementDao

    companion object {
        const val NAME = "bandarbani_azan.db"
    }
}
