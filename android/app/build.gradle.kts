plugins {
    id("com.android.application")
}

android {
    namespace = "online.owaw.yuicry"
    compileSdk = 35

    defaultConfig {
        applicationId = "online.owaw.yuicry"
        minSdk = 26
        targetSdk = 35
        versionCode = 112
        versionName = "1.1.2"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
