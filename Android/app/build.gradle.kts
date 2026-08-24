import java.io.File

plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.oxygenlow.oxygen_lows_software"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.oxygenlow.oxygen_lows_software"
        minSdk = 31
        targetSdk = 37
        versionCode = (project.findProperty("versionCode") as? String)?.toIntOrNull() ?: 1
        versionName = (project.findProperty("versionName") as? String) ?: "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("KEYSTORE_PATH") ?: project.findProperty("KEYSTORE_PATH") as? String
            val keyStoreFile = when {
                keystorePath == null -> null
                file(keystorePath).exists() -> file(keystorePath)
                rootProject.file(keystorePath).exists() -> rootProject.file(keystorePath)
                File(keystorePath).exists() -> File(keystorePath)
                else -> null
            }

            if (keyStoreFile != null) {
                storeFile = keyStoreFile
                storePassword = System.getenv("KEYSTORE_PASSWORD") ?: project.findProperty("KEYSTORE_PASSWORD") as? String
                keyAlias = System.getenv("KEY_ALIAS") ?: project.findProperty("KEY_ALIAS") as? String
                keyPassword = System.getenv("KEY_PASSWORD") ?: project.findProperty("KEY_PASSWORD") as? String
            } else {
                initWith(getByName("debug"))
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}