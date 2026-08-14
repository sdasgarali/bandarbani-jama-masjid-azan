package com.bandarbani.azan.data.repository

import android.util.Log
import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.data.local.dao.AudioDao
import com.bandarbani.azan.data.local.dao.ScheduleDao
import com.bandarbani.azan.data.local.dao.SyncStateDao
import com.bandarbani.azan.data.local.entity.AudioMetaEntity
import com.bandarbani.azan.data.local.entity.PrayerTimeEntity
import com.bandarbani.azan.data.local.entity.ScheduleEntity
import com.bandarbani.azan.data.local.entity.SyncStateEntity
import com.bandarbani.azan.data.remote.AzanApi
import com.bandarbani.azan.data.remote.dto.HeartbeatRequest
import com.bandarbani.azan.data.remote.dto.RegisterDeviceRequest
import com.bandarbani.azan.data.remote.dto.SchedulePayloadDto
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The single source of truth for schedule + audio data. Coordinates the remote API and Room so
 * callers (workers, receivers, UI) never touch DTOs or DAOs directly.
 *
 * Key reliability rule: if the network is unavailable, we keep the last locally-stored schedule and
 * audio. Sync failures NEVER wipe good local state.
 */
@Singleton
class AzanRepository @Inject constructor(
    private val api: AzanApi,
    private val scheduleDao: ScheduleDao,
    private val audioDao: AudioDao,
    private val syncStateDao: SyncStateDao,
) {
    // ---- Observers for UI ----
    fun observeSchedule(): Flow<ScheduleEntity?> = scheduleDao.observeSchedule()
    fun observePrayerTimes(): Flow<List<PrayerTimeEntity>> = scheduleDao.observePrayerTimes()
    fun observeSyncState(): Flow<SyncStateEntity?> = syncStateDao.observe()
    fun observeActiveAudio(): Flow<AudioMetaEntity?> = audioDao.observeActive()

    suspend fun getSchedule(): ScheduleEntity? = scheduleDao.getSchedule()
    suspend fun getActiveAudio(): AudioMetaEntity? = audioDao.getActive()
    suspend fun getPrayerTimes(): List<PrayerTimeEntity> = scheduleDao.getPrayerTimes()

    sealed interface SyncResult {
        data class Updated(val version: Int, val audioNeedsDownload: Boolean) : SyncResult
        data object NotModified : SyncResult
        data object NeverPublished : SyncResult
        data class Failed(val message: String) : SyncResult
    }

    /** Register this device; stores nothing itself — caller stores the returned secret. */
    suspend fun registerDevice(body: RegisterDeviceRequest): Result<String> = runCatching {
        val resp = api.registerDevice(body)
        val secret = resp.body()?.data?.deviceSecret
        require(resp.isSuccessful && secret != null) {
            "register failed: ${resp.code()} ${resp.body()?.error?.message ?: ""}"
        }
        secret
    }

    suspend fun updateFcmToken(token: String): Result<Unit> = runCatching {
        val resp = api.updateFcmToken(com.bandarbani.azan.data.remote.dto.FcmTokenRequest(token))
        require(resp.isSuccessful) { "fcm-token update failed: ${resp.code()}" }
        Unit
    }

    suspend fun heartbeat(timezone: String, appVersion: String): Result<Int?> = runCatching {
        val version = scheduleDao.getSchedule()?.version
        val resp = api.heartbeat(HeartbeatRequest(timezone, appVersion, version))
        resp.body()?.data?.currentVersion
    }

    /**
     * Fetch /schedule/current with ETag. On 200 → persist atomically + record audio meta.
     * On 304 → NotModified. On 404 → NeverPublished. On any error → Failed and local state kept.
     */
    suspend fun syncSchedule(): SyncResult {
        val etag = syncStateDao.get()?.lastEtag
        val resp = try {
            api.getCurrentSchedule(etag)
        } catch (e: Exception) {
            Log.w(TAG, "syncSchedule network error", e)
            recordSyncResult(success = false, etag = etag, message = "Offline: ${e.message}")
            return SyncResult.Failed(e.message ?: "network error")
        }

        return when {
            resp.code() == 304 -> {
                recordSyncResult(success = true, etag = etag, message = "Up to date")
                SyncResult.NotModified
            }
            resp.code() == 404 -> {
                recordSyncResult(success = true, etag = etag, message = "No schedule published")
                SyncResult.NeverPublished
            }
            resp.isSuccessful -> {
                val payload = resp.body()?.data
                if (payload == null) {
                    recordSyncResult(false, etag, "Empty payload")
                    return SyncResult.Failed("empty payload")
                }
                val audioNeedsDownload = applyPayload(payload)
                recordSyncResult(
                    success = true,
                    etag = payload.version.toString(),
                    message = "Synced v${payload.version}",
                )
                SyncResult.Updated(payload.version, audioNeedsDownload)
            }
            else -> {
                val msg = resp.body()?.error?.message ?: "HTTP ${resp.code()}"
                recordSyncResult(false, etag, msg)
                SyncResult.Failed(msg)
            }
        }
    }

    /**
     * Persist a fresh payload into Room atomically. Returns true if the audio referenced is new /
     * not yet downloaded (caller should enqueue AudioSyncWorker).
     */
    private suspend fun applyPayload(payload: SchedulePayloadDto): Boolean {
        val schedule = ScheduleEntity(
            version = payload.version,
            timezone = payload.timezone,
            publishedAt = payload.publishedAt,
            updatedAt = System.currentTimeMillis(),
        )
        val prayers = payload.prayers.mapNotNull { dto ->
            val prayer = Prayer.fromApi(dto.prayer) ?: return@mapNotNull null
            PrayerTimeEntity(
                prayer = prayer,
                time = dto.time,
                enabled = dto.enabled,
                audioEnabled = dto.audioEnabled,
                notificationEnabled = dto.notificationEnabled,
            )
        }
        scheduleDao.replaceSchedule(schedule, prayers)

        val audio = payload.audio ?: return false
        val existing = audioDao.getByVersion(audio.version)
        // Record/refresh metadata. Keep localPath+active state if the file already validated.
        val meta = AudioMetaEntity(
            version = audio.version,
            remoteId = audio.id,
            url = audio.url,
            checksumSha256 = audio.checksumSha256,
            sizeBytes = audio.sizeBytes,
            mimeType = audio.mimeType,
            localPath = existing?.localPath,
            isActive = existing?.isActive ?: false,
            updatedAt = System.currentTimeMillis(),
        )
        audioDao.upsert(meta)
        // Needs download if we don't yet have a verified local file for this version.
        return existing?.localPath == null
    }

    private suspend fun recordSyncResult(success: Boolean, etag: String?, message: String) {
        val prev = syncStateDao.get()
        syncStateDao.upsert(
            SyncStateEntity(
                lastEtag = if (success) etag else prev?.lastEtag,
                lastSyncAt = if (success) System.currentTimeMillis() else prev?.lastSyncAt,
                lastSyncResult = message,
                armedRequestCodes = prev?.armedRequestCodes,
            ),
        )
    }

    companion object {
        private const val TAG = "AzanRepository"
    }
}
