package com.bandarbani.azan.data.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persists the device identity (deviceId + deviceSecret) and light client state in
 * EncryptedSharedPreferences (AES256). deviceId is a stable app-generated UUID; deviceSecret is
 * returned once at registration and used for device auth headers.
 */
@Singleton
class DeviceCredentialStore @Inject constructor(
    context: Context,
) {
    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** Returns the existing deviceId or generates+persists a new UUID (idempotent). */
    fun getOrCreateDeviceId(): String {
        prefs.getString(KEY_DEVICE_ID, null)?.let { return it }
        val id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        return id
    }

    var deviceSecret: String?
        get() = prefs.getString(KEY_DEVICE_SECRET, null)
        set(value) {
            prefs.edit().apply {
                if (value == null) remove(KEY_DEVICE_SECRET) else putString(KEY_DEVICE_SECRET, value)
            }.apply()
        }

    var fcmToken: String?
        get() = prefs.getString(KEY_FCM_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_FCM_TOKEN, value).apply()

    var onboardingComplete: Boolean
        get() = prefs.getBoolean(KEY_ONBOARDING_DONE, false)
        set(value) = prefs.edit().putBoolean(KEY_ONBOARDING_DONE, value).apply()

    val isRegistered: Boolean
        get() = deviceSecret != null

    companion object {
        private const val FILE_NAME = "device_credentials"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_SECRET = "device_secret"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_ONBOARDING_DONE = "onboarding_done"
    }
}
