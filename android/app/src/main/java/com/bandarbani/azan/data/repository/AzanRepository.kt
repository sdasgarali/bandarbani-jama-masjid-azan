package com.bandarbani.azan.data.repository

import android.util.Log
import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.data.local.dao.AnnouncementDao
import com.bandarbani.azan.data.local.dao.AudioDao
import com.bandarbani.azan.data.local.dao.ScheduleDao
import com.bandarbani.azan.data.local.dao.SyncStateDao
import com.bandarbani.azan.data.local.entity.AnnouncementEntity
import com.bandarbani.azan.data.local.entity.AudioMetaEntity
import com.bandarbani.azan.data.local.entity.PrayerTimeEntity
import com.bandarbani.azan.data.local.entity.ScheduleEntity
import com.bandarbani.azan.data.local.entity.SyncStateEntity
import com.bandarbani.azan.data.remote.AzanApi
import com.bandarbani.azan.data.remote.dto.AudioDto
import com.bandarbani.azan.data.remote.dto.HeartbeatRequest
import com.bandarbani.azan.data.remote.dto.RegisterDeviceRequest
import com.bandarbani.azan.data.remote.dto.SchedulePayloadDto
import kotlinx.coroutines.flow.Flow
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The single source of truth for schedule + audio + announcement data. Coordinates the remote API
 * and Room so callers (workers, receivers, UI) never touch DTOs or DAOs directly.
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
    private val announcementDao: AnnouncementDao,
) {
    // ---- Observers for UI ----
    fun observeSchedule(): Flow<ScheduleEntity?> = scheduleDao.observeSchedule()
    fun observePrayerTimes(): Flow<List<PrayerTimeEntity>> = scheduleDao.observePrayerTimes()
    fun observeSyncState(): Flow<SyncStateEntity?> = syncStateDao.observe()
    fun observeEnabledAnnouncements(): Flow<List<AnnouncementEntity>> = announcementDao.observeEnabled()

    suspend fun getSchedule(): ScheduleEntity? = scheduleDao.getSchedule()
    suspend fun getPrayerTimes(): List<PrayerTimeEntity> = scheduleDao.getPrayerTimes()

    // ---- Audio resolution ----

    suspend fun getAudioById(id: String): AudioMetaEntity? = audioDao.getById(id)
    suspend fun getAudioByVersion(version: Int): AudioMetaEntity? = audioDao.getByVersion(version)

    /**
     * Resolve the Azan audio for a prayer following DATABASE.md: prayer.audioId → defaultAudioId →
     * none. Returns the matching audio row (which may still be un-validated; callers must check
     * [AudioMetaEntity.validated] / localPath before playback).
     */
    suspend fun resolvePrayerAudio(prayerAudioId: String?, defaultAudioId: String?): AudioMetaEntity? {
        val id = prayerAudioId ?: defaultAudioId ?: return null
        return audioDao.getById(id)
    }

    /**
     * A validated audio suitable for TEST_AZAN / onboarding checks: the schedule's default audio if
     * it's downloaded, else any validated audio in the library.
     */
    suspend fun getActiveAudio(): AudioMetaEntity? {
        val defaultId = scheduleDao.getSchedule()?.defaultAudioId
        val byDefault = defaultId?.let { audioDao.getById(it) }
        return if (byDefault?.validated == true && byDefault.localPath != null) {
            byDefault
        } else {
            audioDao.getAnyValidated()
        }
    }

    suspend fun getEnabledFutureAnnouncements(nowMillis: Long): List<AnnouncementEntity> =
        announcementDao.getEnabledFuture(nowMillis)

    suspend fun getAnnouncementById(id: String): AnnouncementEntity? = announcementDao.getById(id)

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
     * Persist a fresh payload into Room atomically. Returns true if ANY referenced audio (a prayer
     * audio, the default, or an announcement audio) is not yet downloaded/validated (caller should
     * enqueue AudioSyncWorker).
     *
     * We preserve any already-verified local file + validated flag when the same audio version is
     * re-published, so re-syncing never forces a re-download of an unchanged clip.
     */
    private suspend fun applyPayload(payload: SchedulePayloadDto): Boolean {
        val now = System.currentTimeMillis()

        // 1) Schedule + prayers (with per-prayer audioId + default).
        val schedule = ScheduleEntity(
            version = payload.version,
            timezone = payload.timezone,
            publishedAt = payload.publishedAt,
            defaultAudioId = payload.defaultAudioId,
            updatedAt = now,
        )
        val prayers = payload.prayers.mapNotNull { dto ->
            val prayer = Prayer.fromApi(dto.prayer) ?: return@mapNotNull null
            PrayerTimeEntity(
                prayer = prayer,
                time = dto.time,
                enabled = dto.enabled,
                audioEnabled = dto.audioEnabled,
                notificationEnabled = dto.notificationEnabled,
                audioId = dto.audioId,
            )
        }
        scheduleDao.replaceSchedule(schedule, prayers)

        // 2) Audio library — every audio in audios[] PLUS every announcement's inline audio, deduped
        //    by version. Preserve existing verified files.
        val allAudio: List<AudioDto> =
            (payload.audios + payload.announcements.map { it.audio })
                .associateBy { it.version } // dedupe by version (last wins; same content)
                .values
                .toList()

        var needsDownload = false
        val metas = allAudio.map { dto ->
            val existing = audioDao.getByVersion(dto.version)
            // Keep the local file only if it's validated, still on disk, and the checksum still
            // matches the freshly-published metadata (guards a version re-issued with new bytes).
            val keptLocalPath = existing
                ?.takeIf {
                    it.validated &&
                        it.localPath != null &&
                        it.checksumSha256.equals(dto.checksumSha256, ignoreCase = true)
                }
                ?.localPath
            if (keptLocalPath == null) needsDownload = true
            AudioMetaEntity(
                version = dto.version,
                id = dto.id,
                label = dto.label,
                path = dto.downloadRef,
                checksumSha256 = dto.checksumSha256,
                sizeBytes = dto.sizeBytes,
                mimeType = dto.mimeType,
                localPath = keptLocalPath,
                validated = keptLocalPath != null,
                updatedAt = now,
            )
        }
        if (metas.isNotEmpty()) audioDao.upsertAll(metas)

        // 3) Announcements (replace-all). Parse the ISO instant → epoch millis; skip unparseable.
        val announcements = payload.announcements.mapNotNull { dto ->
            val epochMillis = parseInstantOrNull(dto.scheduledAt) ?: run {
                Log.w(TAG, "Skipping announcement ${dto.id}: bad scheduledAt '${dto.scheduledAt}'")
                return@mapNotNull null
            }
            AnnouncementEntity(
                id = dto.id,
                label = dto.label,
                scheduledAtEpochMillis = epochMillis,
                enabled = dto.enabled,
                audioVersion = dto.audio.version,
            )
        }
        announcementDao.replaceAll(announcements)

        return needsDownload
    }

    private fun parseInstantOrNull(iso: String): Long? = try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: Exception) {
        null
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
