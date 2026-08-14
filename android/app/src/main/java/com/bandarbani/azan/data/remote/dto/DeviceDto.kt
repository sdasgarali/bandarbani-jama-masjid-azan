package com.bandarbani.azan.data.remote.dto

import kotlinx.serialization.Serializable

/** Request/response DTOs for the device endpoints in API.md. */

@Serializable
data class RegisterDeviceRequest(
    val deviceId: String,
    val platform: String = "android",
    val appVersion: String,
    val androidVersion: Int,
    val model: String? = null,
    val timezone: String,
    val fcmToken: String? = null,
)

@Serializable
data class RegisterDeviceResponse(
    val deviceSecret: String,
)

@Serializable
data class FcmTokenRequest(
    val fcmToken: String,
)

@Serializable
data class HeartbeatRequest(
    val timezone: String? = null,
    val appVersion: String? = null,
    val scheduleVersion: Int? = null,
)

@Serializable
data class HeartbeatResponse(
    val currentVersion: Int? = null,
)
