import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.google.services)
}

// Optional: read API base URL override from local.properties so it never gets committed.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// Optional: read release-signing material from a gitignored keystore.properties at the android/ root
// (keys: storeFile, storePassword, keyAlias, keyPassword). See keystore.properties.example.
// If the file is absent we skip the release signingConfig entirely so debug builds never break.
val keystorePropsFile = rootProject.file("keystore.properties")
val hasReleaseKeystore = keystorePropsFile.exists()
val keystoreProps = Properties().apply {
    if (hasReleaseKeystore) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "com.bandarbani.azan"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bandarbani.azan"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    signingConfigs {
        // Only declare the release signing config when keystore.properties is present.
        // Absent → assembleRelease falls back to the debug key below so the build never fails
        // on configuration (unsigned material is simply not referenced).
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // 10.0.2.2 is the host loopback as seen from the Android emulator.
            val debugUrl = localProps.getProperty("API_BASE_URL")
                ?: "http://10.0.2.2:4000/api/v1/"
            buildConfigField("String", "API_BASE_URL", "\"$debugUrl\"")
            isMinifyEnabled = false
        }
        release {
            // MUST be set for a self-hosted backend. Add to android/local.properties:
            //   API_BASE_URL_RELEASE=http://<your-server-ip>:4000/api/v1/
            // (trailing slash required by Retrofit). The value below is a non-working
            // placeholder on purpose — do NOT ship a release without overriding it.
            val releaseUrl = localProps.getProperty("API_BASE_URL_RELEASE")
                ?: "http://SET_API_BASE_URL_RELEASE_IN_LOCAL_PROPERTIES:4000/api/v1/"
            buildConfigField("String", "API_BASE_URL", "\"$releaseUrl\"")

            // Sign with the real release key when keystore.properties exists; otherwise fall back
            // to the debug key so `assembleRelease` still produces an installable (test-signed) APK
            // and configuration never fails.
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }

            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    // Core / lifecycle
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose (BOM-managed)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Room
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // WorkManager + Hilt worker integration
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization.converter)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    // Media3 / ExoPlayer
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.common)
    implementation(libs.media3.session)

    // Security / storage
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.datastore.preferences)

    // Firebase (FCM)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    // java.time desugaring for API < 26 safety (min is 26, kept for full API set)
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.2")

    // Unit tests
    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.work.testing)
    testImplementation(libs.androidx.room.testing)
    testImplementation(libs.androidx.arch.core.testing)
    testImplementation(libs.kotlinx.serialization.json)

    // Instrumented tests
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.work.testing)
}
