package com.bandarbani.azan.data.remote

import com.bandarbani.azan.data.prefs.DeviceCredentialStore
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Adds X-Device-Id / X-Device-Secret headers to every request (device auth per API.md).
 * The registration call has no secret yet; it simply omits the secret header, which the backend
 * accepts for that unauthenticated route.
 */
@Singleton
class DeviceAuthInterceptor @Inject constructor(
    private val credentials: DeviceCredentialStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val builder = original.newBuilder()
            .header("X-Device-Id", credentials.getOrCreateDeviceId())

        credentials.deviceSecret?.let { secret ->
            builder.header("X-Device-Secret", secret)
        }

        return chain.proceed(builder.build())
    }
}
