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
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.data.local.dao.AudioDao
import com.bandarbani.azan.data.remote.AzanApi
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Downloads the active audio version safely (ANDROID_SCHEDULING.md §5):
 *  1. Look up the pending (non-active or missing-file) audio meta from Room.
 *  2. Download to `azan_v<version>.mp3.tmp`.
 *  3. Verify sha256 + size.
 *  4. Atomically rename to `azan_v<version>.mp3`, update Room's active pointer.
 *  5. Delete the OLD active file only AFTER the new one is verified & promoted.
 * On any failure, the old file + old active pointer are kept intact → playback keeps working.
 */
@HiltWorker
class AudioSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val api: AzanApi,
    private val audioDao: AudioDao,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        // Determine target: the most-recent meta that has no verified local file.
        val all = audioDao.getAll()
        val target = all
            .filter { it.localPath == null || !File(it.localPath).exists() }
            .maxByOrNull { it.version }
            ?: run {
                Log.i(TAG, "No audio needs downloading.")
                return Result.success()
            }

        val previousActive = audioDao.getActive()

        val dir = File(applicationContext.filesDir, Constants.AUDIO_DIR).apply { mkdirs() }
        val tmp = File(dir, Constants.audioTmpName(target.version))
        val finalFile = File(dir, Constants.audioFileName(target.version))

        return try {
            // (2) Download to tmp.
            val resp = api.downloadAudio(target.url)
            val body = resp.body()
            if (!resp.isSuccessful || body == null) {
                Log.w(TAG, "Download failed HTTP ${resp.code()} for v${target.version}")
                return Result.retry()
            }
            if (tmp.exists()) tmp.delete()
            body.byteStream().use { input ->
                tmp.outputStream().use { output -> input.copyTo(output, 16 * 1024) }
            }

            // (3) Verify size + checksum.
            if (target.sizeBytes > 0 && tmp.length() != target.sizeBytes) {
                Log.w(TAG, "Size mismatch v${target.version}: ${tmp.length()} != ${target.sizeBytes}")
                tmp.delete()
                return Result.retry()
            }
            val actual = FileHashing.sha256(tmp)
            if (!actual.equals(target.checksumSha256, ignoreCase = true)) {
                Log.w(TAG, "Checksum mismatch v${target.version}; keeping old audio.")
                tmp.delete()
                return Result.retry()
            }

            // (4) Atomic promote.
            if (finalFile.exists()) finalFile.delete()
            if (!tmp.renameTo(finalFile)) {
                // Fallback copy if rename across the same dir somehow fails.
                tmp.copyTo(finalFile, overwrite = true)
                tmp.delete()
            }
            audioDao.promoteActive(
                target.copy(localPath = finalFile.absolutePath, isActive = true),
            )

            // (5) Delete old file only now (never before the new one is live).
            previousActive?.let { old ->
                if (old.version != target.version) {
                    old.localPath?.let { path ->
                        val f = File(path)
                        if (f.exists() && f != finalFile) f.delete()
                    }
                }
            }

            Log.i(TAG, "Audio v${target.version} downloaded & promoted.")
            Result.success()
        } catch (t: Throwable) {
            Log.e(TAG, "Audio sync error", t)
            runCatching { if (tmp.exists()) tmp.delete() }
            Result.retry()
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
