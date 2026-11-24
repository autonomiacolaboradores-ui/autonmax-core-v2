# AUTONMAX vNext — R8 / ProGuard preservation rules

# Capacitor Core & Plugins
-keep class com.getcapacitor.** { *; }
-keepclassmembers class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# WebView JavascriptInterface bridge
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor Community SQLite & Filesystem & Secure Storage
-keep class com.getcapacitor.community.database.sqlite.** { *; }
-keep class com.capacitorjs.plugins.filesystem.** { *; }
-keep class com.whitestein.securestorage.** { *; }

# App entrypoints
-keep class br.com.autonmax.app.** { *; }
