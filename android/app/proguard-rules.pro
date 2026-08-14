# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
# Keep @Serializable model classes and their generated serializers.
-keep,includedescriptorclasses class com.bandarbani.azan.**$$serializer { *; }
-keepclassmembers class com.bandarbani.azan.** {
    *** Companion;
}
-keepclasseswithmembers class com.bandarbani.azan.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit
-keepattributes Signature, Exceptions
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Room — generated implementations
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-dontwarn androidx.room.paging.**

# Hilt / Dagger generated
-dontwarn com.google.errorprone.annotations.**

# Firebase Messaging
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Media3
-dontwarn androidx.media3.**

# Keep entity/DTO field names (serialization + Room)
-keepclassmembers,allowobfuscation class com.bandarbani.azan.data.** {
    <fields>;
}
