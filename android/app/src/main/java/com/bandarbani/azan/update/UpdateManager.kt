package com.bandarbani.azan.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.bandarbani.azan.BuildConfig
import com.bandarbani.azan.audio.FileHashing
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.data.remote.AzanApi
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Orchestrates in-app auto-update (no Play Store): checks the latest release, downloads the APK to
 * app-private storage, verifies its sha256, and launches the system package installer via a
 * FileProvider. See docs/API.md §"App releases / auto-update".
 *
 * Reliability rules:
 *  - [checkForUpdate] swallows all network errors and returns null (offline must never crash).
 *  - The APK is streamed to disk (never buffered whole in memory).
 *  - A checksum mismatch throws and the partial file is deleted (never install a corrupt APK).
 *  - The installed app and the update APK MUST be signed with the SAME keystore or Android rejects
 *    the install — this is a build/release concern (see android/README.md §"In-app updates").
 */
@Singleton
class UpdateManager @Inject constructor(
    private val api: AzanApi,
    private val okHttpClient: OkHttpClient,
    @ApplicationContext private val appContext: Context,
) {

    /** Observable state so the UI (dialog/banner) can react without polling. */
    sealed interface State {
        data object Idle : State
        data object Checking : State
        data class Available(val info: UpdateInfo) : State
        data class Downloading(val info: UpdateInfo, val percent: Int) : State
        data class ReadyToInstall(val info: UpdateInfo, val file: File) : State
        data class Error(val message: String, val info: UpdateInfo? = null) : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    /**
     * Calls GET /app/latest-version and compares the server versionCode with the installed one.
     * @return an [UpdateInfo] when the server version is strictly newer, else null (up to date,
     *         no releases, or offline). Never throws.
     */
    suspend fun checkForUpdate(): UpdateInfo? {
        _state.value = State.Checking
        return try {
            val dto = api.latestVersion().data
            if (dto == null) {
                Log.i(TAG, "latest-version returned no data")
                _state.value = State.Idle
                return null
            }
            if (dto.versionCode > BuildConfig.VERSION_CODE) {
                val info = UpdateInfo(
                    versionCode = dto.versionCode,
                    versionName = dto.versionName,
                    notes = dto.notes,
                    mandatory = dto.mandatory,
                    sizeBytes = dto.sizeBytes,
                    checksumSha256 = dto.checksumSha256,
                    apkPath = dto.apkPath,
                )
                _state.value = State.Available(info)
                info
            } else {
                Log.i(TAG, "Up to date (installed=${BuildConfig.VERSION_CODE}, latest=${dto.versionCode})")
                _state.value = State.Idle
                null
            }
        } catch (t: Throwable) {
            // Offline / 404 (no releases) / parse error → treat as "no update". Do not crash.
            Log.w(TAG, "checkForUpdate failed (treated as no update): ${t.message}")
            _state.value = State.Idle
            null
        }
    }

    /**
     * Streams the APK for [info] to app-private storage, verifying size + sha256. Emits
     * [State.Downloading] progress and [State.ReadyToInstall] on success.
     *
     * @throws IOException on network/HTTP failure or checksum mismatch (partial file is deleted).
     */
    suspend fun downloadApk(info: UpdateInfo): File = withContext(Dispatchers.IO) {
        val dir = updatesDir().apply { mkdirs() }
        val tmp = File(dir, Constants.apkTmpName(info.versionCode))
        val finalFile = File(dir, Constants.apkFileName(info.versionCode))

        // If a previously verified APK for this version already exists, reuse it.
        if (finalFile.exists() && info.checksumSha256.isNotEmpty() &&
            FileHashing.sha256(finalFile).equals(info.checksumSha256, ignoreCase = true)
        ) {
            _state.value = State.ReadyToInstall(info, finalFile)
            return@withContext finalFile
        }

        _state.value = State.Downloading(info, 0)
        if (tmp.exists()) tmp.delete()

        // Build the absolute URL from the app's own API base (base ends with "/"; apkPath is relative).
        val url = BuildConfig.API_BASE_URL.trimEnd('/') + "/" + info.apkPath.trimStart('/')
        val request = Request.Builder().url(url).get().build()

        try {
            okHttpClient.newCall(request).execute().use { response ->
                val body = response.body
                if (!response.isSuccessful || body == null) {
                    throw IOException("APK download failed: HTTP ${response.code}")
                }
                // Prefer server size; fall back to the release metadata for the progress denominator.
                val contentLength = body.contentLength().takeIf { it > 0 }
                    ?: info.sizeBytes.takeIf { it > 0 }
                    ?: -1L

                body.byteStream().use { input ->
                    tmp.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var downloaded = 0L
                        var lastPercent = -1
                        while (true) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (contentLength > 0) {
                                val percent = ((downloaded * 100) / contentLength).toInt().coerceIn(0, 100)
                                if (percent != lastPercent) {
                                    lastPercent = percent
                                    _state.value = State.Downloading(info, percent)
                                }
                            }
                        }
                    }
                }
            }

            // Verify size (when known) + checksum before promoting.
            if (info.sizeBytes > 0 && tmp.length() != info.sizeBytes) {
                throw IOException("APK size mismatch: ${tmp.length()} != ${info.sizeBytes}")
            }
            if (info.checksumSha256.isNotEmpty()) {
                val actual = FileHashing.sha256(tmp)
                if (!actual.equals(info.checksumSha256, ignoreCase = true)) {
                    throw IOException("APK checksum mismatch")
                }
            }

            if (finalFile.exists()) finalFile.delete()
            if (!tmp.renameTo(finalFile)) {
                tmp.copyTo(finalFile, overwrite = true)
                tmp.delete()
            }
            _state.value = State.ReadyToInstall(info, finalFile)
            finalFile
        } catch (t: Throwable) {
            Log.e(TAG, "downloadApk failed", t)
            runCatching { if (tmp.exists()) tmp.delete() }
            _state.value = State.Error(t.message ?: "Download failed", info)
            throw t
        }
    }

    /**
     * Launches the system package installer for [file]. On API 26+ the user must have granted this
     * app permission to install unknown apps; if not, we deep-link to that settings screen instead
     * so the user can allow it, then re-tap Install.
     *
     * @return true if the installer intent was launched; false if we redirected to the
     *         "install unknown apps" settings screen (caller should inform the user).
     */
    fun installApk(context: Context, file: File): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            // Explain-and-redirect: user must allow "Install unknown apps" for this app first.
            val settings = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { context.startActivity(settings) }
                .onFailure { Log.w(TAG, "Could not open unknown-app-sources settings", it) }
            return false
        }

        val uri: Uri = FileProvider.getUriForFile(
            context,
            context.packageName + Constants.FILE_PROVIDER_AUTHORITY_SUFFIX,
            file,
        )
        val install = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, Constants.APK_MIME_TYPE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return runCatching {
            context.startActivity(install)
            true
        }.getOrElse {
            Log.e(TAG, "Failed to launch installer", it)
            _state.value = State.Error("Could not launch installer")
            false
        }
    }

    /** Whether this app may currently install packages (always true below API 26). */
    fun canInstallPackages(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()

    fun reset() {
        _state.value = State.Idle
    }

    /** getExternalFilesDir("updates") when available, else cacheDir/updates (matches file_paths.xml). */
    private fun updatesDir(): File =
        appContext.getExternalFilesDir(Constants.UPDATES_DIR)
            ?: File(appContext.cacheDir, Constants.UPDATES_DIR)

    companion object {
        private const val TAG = "UpdateManager"
    }
}
