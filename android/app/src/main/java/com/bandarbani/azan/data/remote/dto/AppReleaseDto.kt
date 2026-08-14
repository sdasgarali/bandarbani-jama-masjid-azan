package com.bandarbani.azan.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Response of GET /app/latest-version (see API.md §"App releases / auto-update").
 * The server returns the newest release by [versionCode]. `apkPath` is a RELATIVE path
 * (e.g. "app/releases/2/file"); the app builds the absolute URL from its own API base
 * (BuildConfig.API_BASE_URL + apkPath) so it never hardcodes the host.
 *
 * All optional fields default so a partial payload (older backend, missing `notes`) still parses.
 * The Json instance in NetworkModule also has ignoreUnknownKeys = true.
 */
@Serializable
data class LatestVersionDto(
    val versionCode: Int,
    val versionName: String,
    val notes: String? = null,
    val mandatory: Boolean = false,
    val sizeBytes: Long = 0L,
    val checksumSha256: String = "",
    val apkPath: String = "",
)
