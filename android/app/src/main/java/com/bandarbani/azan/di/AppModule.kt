package com.bandarbani.azan.di

import android.content.Context
import androidx.room.Room
import com.bandarbani.azan.data.local.AppDatabase
import com.bandarbani.azan.data.local.dao.AudioDao
import com.bandarbani.azan.data.local.dao.ScheduleDao
import com.bandarbani.azan.data.local.dao.SyncStateDao
import com.bandarbani.azan.data.prefs.DeviceCredentialStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, AppDatabase.NAME)
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideScheduleDao(db: AppDatabase): ScheduleDao = db.scheduleDao()

    @Provides
    fun provideAudioDao(db: AppDatabase): AudioDao = db.audioDao()

    @Provides
    fun provideSyncStateDao(db: AppDatabase): SyncStateDao = db.syncStateDao()

    @Provides
    @Singleton
    fun provideCredentialStore(@ApplicationContext context: Context): DeviceCredentialStore =
        DeviceCredentialStore(context)
}
