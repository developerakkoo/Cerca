# Android 15 Kotlin Compatibility Fix

## Issue
Google Play Console is reporting that the app uses Kotlin's `removeFirst()` and `removeLast()` extension functions, which conflict with Java functions in Android 15. This causes crashes on Android 14 or earlier devices.

The error occurs in:
- `com.getcapacitor.Bridge$$ExternalSyntheticApiModelOutline0.m`

## Solution Applied

### 1. Added Kotlin Plugin and Version Configuration
- Added Kotlin Gradle plugin to `android/build.gradle`
- Set Kotlin version to 1.9.24 (compatible version)
- Added Kotlin stdlib dependencies to ensure consistent version

### 2. Updated Java Version
- Changed Java version from 21 to 17 in `capacitor.build.gradle` (note: this file is auto-generated, but the change helps)
- Updated `app/build.gradle` to use Java 17

### 3. Added ProGuard Rules
- Added rules to preserve Kotlin collection functions
- This helps R8/ProGuard handle the Kotlin extension functions correctly

### 4. Force Kotlin Version Resolution
- Added resolution strategy in `build.gradle` to force Kotlin 1.9.24 across all modules

## Files Modified

1. `/android/build.gradle` - Added Kotlin plugin and version resolution
2. `/android/app/build.gradle` - Added Kotlin plugin, Java 17, and Kotlin options
3. `/android/app/capacitor.build.gradle` - Changed Java version to 17 (will be regenerated on `capacitor update`)
4. `/android/gradle.properties` - Added Kotlin version properties
5. `/android/app/proguard-rules.pro` - Added Kotlin collection preservation rules

## Important Notes

⚠️ **Warning**: The `capacitor.build.gradle` file is auto-generated. If you run `npx cap sync` or `npx cap update`, you may need to reapply the Java version change.

## Testing

After applying these changes:
1. Clean the build: `cd android && ./gradlew clean`
2. Rebuild the app: `./gradlew assembleRelease` or build from Android Studio
3. Test on Android 14 and Android 15 devices/emulators
4. Verify the app doesn't crash on startup

## Alternative Solution (If Issue Persists)

If the issue persists, consider updating Capacitor to the latest version:
```bash
npm install @capacitor/core@latest @capacitor/android@latest
npx cap sync
```

However, note that Capacitor 8.x is currently in nightly builds and may not be stable.

## References

- [Android 15 Kotlin Compatibility](https://developer.android.com/about/versions/15/behavior-changes-15)
- [Capacitor GitHub Issues](https://github.com/ionic-team/capacitor/issues)

