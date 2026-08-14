package com.bandarbani.azan.data.remote

import com.bandarbani.azan.data.remote.dto.ApiEnvelope
import com.bandarbani.azan.data.remote.dto.AudioMetaDto
import com.bandarbani.azan.data.remote.dto.FcmTokenRequest
import com.bandarbani.azan.data.remote.dto.HeartbeatRequest
import com.bandarbani.azan.data.remote.dto.HeartbeatResponse
import com.bandarbani.azan.data.remote.dto.LatestVersionDto
import com.bandarbani.azan.data.remote.dto.RegisterDeviceRequest
import com.bandarbani.azan.data.remote.dto.RegisterDeviceResponse
import com.bandarbani.azan.data.remote.dto.SchedulePayloadDto
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Streaming
import retrofit2.http.Url

/**
 * Retrofit interface matching API.md. Device routes require X-Device-Id / X-Device-Secret headers,
 * added automatically by [com.bandarbani.azan.data.remote.DeviceAuthInterceptor] (except register).
 */
interface AzanApi {

    /** Register happens BEFORE we have a secret, so it must not go through the auth interceptor. */
    @POST("devices/register")
    suspend fun registerDevice(
        @Body body: RegisterDeviceRequest,
    ): Response<ApiEnvelope<RegisterDeviceResponse>>

    @PUT("devices/fcm-token")
    suspend fun updateFcmToken(
        @Body body: FcmTokenRequest,
    ): Response<ApiEnvelope<Unit>>

    @POST("devices/heartbeat")
    suspend fun heartbeat(
        @Body body: HeartbeatRequest,
    ): Response<ApiEnvelope<HeartbeatResponse>>

    /**
     * Latest published schedule. Supports conditional GET via If-None-Match = version.
     * Returns 200 with body, 304 (empty) when unchanged, or 404 if never published.
     */
    @GET("schedule/current")
    suspend fun getCurrentSchedule(
        @Header("If-None-Match") ifNoneMatch: String?,
    ): Response<ApiEnvelope<SchedulePayloadDto>>

    @GET("audio/{version}/meta")
    suspend fun getAudioMeta(
        @Path("version") version: Int,
    ): Response<ApiEnvelope<AudioMetaDto>>

    /**
     * Latest published app release for in-app auto-update (API.md §"App releases / auto-update").
     * Public endpoint — needs no device auth (the DeviceAuthInterceptor still attaches its headers,
     * which is harmless here). 404 if there are no releases yet; the [UpdateManager] treats that as
     * "no update". The APK bytes are fetched separately via [downloadAudio]-style OkHttp streaming
     * (see UpdateManager) so the whole file is never buffered in memory.
     */
    @GET("app/latest-version")
    suspend fun latestVersion(): ApiEnvelope<LatestVersionDto>

    /**
     * Streams the MP3 for a given audio. The caller passes an absolute URL built from
     * BuildConfig.API_BASE_URL + the payload's relative `audio.path` (see AudioSyncWorker.downloadUrl).
     * @Streaming avoids loading the whole body into memory — the worker copies to a temp file.
     */
    @Streaming
    @GET
    suspend fun downloadAudio(
        @Url url: String,
    ): Response<ResponseBody>
}
