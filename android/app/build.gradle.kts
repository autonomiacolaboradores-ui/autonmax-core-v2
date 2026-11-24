plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "br.com.autonmax.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.autonmax.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 10000
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation(project(":capacitor-android"))
    implementation(project(":capacitor-community-sqlite"))
    implementation(project(":capacitor-filesystem"))
    implementation(project(":capacitor-secure-storage-plugin"))
}
