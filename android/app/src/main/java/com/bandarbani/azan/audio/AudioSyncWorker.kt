package com.bandarbani.azan.audio

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bandarbani.azan.BuildConfig
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.data.local.dao.AudioDao
import com.bandarbani.azan.data.local.entity.AudioMetaEntity
import com.bandarbani.azan.data.remote.AzanApi
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Downloads & caches EVERY audio the payload references (ANDROID_SCHEDULING.md §5, §6b):
 *   - all Azan clips in `audios[]`
 *   - every announcement's audio
 * (deduped by version — the repository already stored one AudioMetaEntity row per version.)
 *
 * For each row that is not yet validated (or whose file is missing) we:
 *   1. Download to `azan_v<version>.mp3.tmp`.
 *   2. Verify sha256 + size.
 *   3. Atomically rename to `azan_v<version>.mp3` and mark the row validated in Room.
 * The OLD verified file is kept until the new one validates. We NEVER delete a file that is still
 * referenced by a currently-stored audio row. On per-item failure we keep going and return retry so
 * the whole set eventually converges.
 */
@HiltWorker
class AudioSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val api: AzanApi,
    private val audioDao: AudioDao,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val all = audioDao.getAll()
        // Targets: rows without a verified local file present on disk.
        val targets = all.filter { !it.validated || it.localPath == null || !File(it.localPath).exists() }
        if (targets.isEmpty()) {
            Log.i(TAG, "No audio needs downloading.")
            pruneOrphanFiles(all)
            return Result.success()
        }

        val dir = File(applicationContext.filesDir, Constants.AUDIO_DIR).apply { mkdirs() }
        var anyFailed = false

        for (target in targets) {
            val ok = runCatching { downloadOne(target, dir) }
                .getOrElse {
                    Log.e(TAG, "Audio sync error for v${target.version}", it)
                    false
                }
            if (!ok) anyFailed = true
        }

        // Only remove files that no stored audio row references (avoid orphan buildup). Files backing
        // a still-referenced version are always kept.
        pruneOrphanFiles(audioDao.getAll())

        return if (anyFailed) Result.retry() else Result.success()
    }

    /** Returns true if the target ended validated (already-present counts as success). */
    private suspend fun downloadOne(target: AudioMetaEntity, dir: File): Boolean {
        val finalFile = File(dir, Constants.audioFileName(target.version))
        val tmp = File(dir, Constants.audioTmpName(target.version))

        // Fast path: file already on disk & checksum matches — just (re)mark validated. When the
        // server reports a size we require it to match first (cheap) before hashing.
        val sizeOk = target.sizeBytes <= 0 || finalFile.length() == target.sizeBytes
        if (finalFile.exists() && sizeOk) {
            val hash = FileHashing.sha256(finalFile)
            if (hash.equals(target.checksumSha256, ignoreCase = true)) {
                audioDao.markValidated(target.version, finalFile.absolutePath, System.currentTimeMillis())
                Log.i(TAG, "Audio v${target.version} already cached & verified.")
                return true
            }
        }

        val url = downloadUrl(target.path)
        if (url.isBlank()) {
            Log.w(TAG, "Audio v${target.version} has no path; skipping.")
            return false
        }

        val resp = api.downloadAudio(url)
        val body = resp.body()
        if (!resp.isSuccessful || body == null) {
            Log.w(TAG, "Download failed HTTP ${resp.code()} for v${target.version}")
            return false
        }
        if (tmp.exists()) tmp.delete()
        body.byteStream().use { input ->
            tmp.outputStream().use { output -> input.copyTo(output, 16 * 1024) }
        }

        // Verify size + checksum.
        if (target.sizeBytes > 0 && tmp.length() != target.sizeBytes) {
            Log.w(TAG, "Size mismatch v${target.version}: ${tmp.length()} != ${target.sizeBytes}")
            tmp.delete()
            return false
        }
        val actual = FileHashing.sha256(tmp)
        if (!actual.equals(target.checksumSha256, ignoreCase = true)) {
            Log.w(TAG, "Checksum mismatch v${target.version}; keeping old audio.")
            tmp.delete()
            return false
        }

        // Atomic promote (keep any old file for OTHER versions untouched).
        if (finalFile.exists()) finalFile.delete()
        if (!tmp.renameTo(finalFile)) {
            tmp.copyTo(finalFile, overwrite = true)
            tmp.delete()
        }
        audioDao.markValidated(target.version, finalFile.absolutePath, System.currentTimeMillis())
        Log.i(TAG, "Audio v${target.version} downloaded & validated.")
        return true
    }

    /** Delete azan_v*.mp3 files whose version is no longer referenced by any stored audio row. */
    private fun pruneOrphanFiles(current: List<AudioMetaEntity>) {
        val dir = File(applicationContext.filesDir, Constants.AUDIO_DIR)
        if (!dir.isDirectory) return
        val referenced = current.map { Constants.audioFileName(it.version) }.toHashSet()
        dir.listFiles()?.forEach { f ->
            val name = f.name
            val isAudio = name.startsWith("azan_v") && name.endsWith(".mp3")
            if (isAudio && name !in referenced) {
                runCatching { f.delete() }
            }
        }
    }

    /** BuildConfig.API_BASE_URL ends with a slash; audio `path` is relative (e.g. "audio/3/file"). */
    private fun downloadUrl(path: String): String {
        if (path.isBlank()) return ""
        // Already absolute (legacy) — hand straight to the streaming call.
        if (path.startsWith("http://") || path.startsWith("https://")) return path
        val base = BuildConfig.API_BASE_URL
        return if (path.startsWith("/")) {
            // Absolute server path like "/api/v1/audio/3/file": resolve against the ORIGIN
            // (scheme://host[:port]) only, so we don't duplicate the "/api/v1" base path.
            val origin = runCatching {
                val u = java.net.URI(base)
                val port = if (u.port != -1) ":${u.port}" else ""
                "${u.scheme}://${u.host}$port"
            }.getOrDefault(base.trimEnd('/'))
            origin + path
        } else {
            base.trimEnd('/') + "/" + path
        }
    }

    companion object {
        private const val TAG = "AudioSyncWorker"

        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<AudioSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                Constants.WORK_AUDIO_DOWNLOAD,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
