package com.bandarbani.azan.update

/**
 * A resolved, newer-than-installed app release. Produced by [UpdateManager.checkForUpdate] from the
 * server's LatestVersionDto. `apkPath` is relative to the API base; the manager builds the absolute
 * download URL from it.
 */
data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val notes: String?,
    val mandatory: Boolean,
    val sizeBytes: Long,
    val checksumSha256: String,
    val apkPath: String,
)
