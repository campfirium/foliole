# Build from Source

For everyday use, start from a [release tag](https://github.com/campfirium/foliole/releases). For the latest unreleased source, use the `dev` branch of [campfirium/foliole](https://github.com/campfirium/foliole). Preserve any local changes when updating an existing checkout; do not reset or clean them away. Record the selected commit with `git rev-parse HEAD`.

Install Node.js 22.13+ (22.x), npm, Python 3, and your platform's native build tools, then run `npm ci` at the repository root. Build commands use that checkout; they do not fetch newer source. Installation is a separate step in the Android workflow below.

Build on the operating system you are targeting.

## macOS

```sh
npm run build:macos
```

On an arm64 Mac with Xcode installed, this produces a DMG and ZIP in `artifacts/macos/source-arm64/`. The app includes Foliole Aide's Codex helper, global capture, and the `foliole` CLI. By default, it uses separate app data and library folders from an installed Foliole release.

The local package is signed ad hoc and is not notarized; it needs no Foliole certificate. Distributing a trusted macOS app requires signing and notarizing with your own Apple credentials.

## Windows

```sh
npm run build:windows
```

Run this on Windows with Visual Studio C++ Build Tools installed. The installer is in `artifacts/windows/`.

## Linux x64

```sh
npm run build:linux
```

Run this on Linux x64 with the native C++ toolchain and Debian packaging tools installed. The DEB is in `artifacts/linux/`.

Windows and Linux packages use the standard Foliole installation identity, so installing one may replace an existing installation.

## Android

Install JDK 21 and Android SDK API 36, and set `JAVA_HOME` and `ANDROID_HOME`. Run:

```sh
npm run build:android
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. A debug build needs no release keystore.

The public build produces the ordinary offline Foliole app. Unset `FOLIOLE_DEV_LIVE_RELOAD`, `FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID`, and any acceptance-specific `FOLIOLE_ANDROID_COMPANION_SYNC_PORT` before building. These settings belong to separate development workflows.

### Upgrade an existing Android installation

Enable USB debugging and authorize this computer on the intended phone. Put Android SDK Platform-Tools (`adb`) and the installed Build-Tools directory (`aapt2`) on `PATH`, or supply executable paths with `--adb` and `--aapt2`. List devices with `adb devices -l`, then use the serial of the phone the user wants to upgrade:

```sh
npm run upgrade:android -- --device PHONE_SERIAL --apk android/app/build/outputs/apk/debug/app-debug.apk
```

Run this only after the build above succeeds. A leftover APK path does not establish which commit produced it. An Agent should report the source commit it built and stop if any build stage fails.

This command requires ordinary Foliole (`com.campfirium.foliole.android`) to be installed for the phone's foreground Android user. It verifies the APK package, requests a data-preserving replacement on the explicit device and user, then starts Foliole. It does not select a device automatically, back up or copy the database, synchronize libraries, uninstall the app, or clear its data. An acceptance app alone does not count as the ordinary installation.

Android must accept the signing identity and version as an update. Keep the original debug keystore when rebuilding your own installation: a new computer's debug key, a release-signed installation, or a newer installed version may prevent replacement. The command stops on failure without attempting a downgrade or reinstall. See [Android signing](https://developer.android.com/studio/publish/app-signing) and [ADB installation options](https://developer.android.com/tools/adb).

Successful installation and successful launch are reported separately. If launch fails after installation, the new app is already installed; the command does not reinstall or restore data. Installation success alone does not verify that the new code can read every existing note and attachment. For a first installation, install the built APK on the selected phone using Android's standard installation tools instead; this upgrade command deliberately requires an existing app.

## iOS

Install Xcode 26 on a Mac. Run:

```sh
npm run android:web:build
npx cap sync ios
npx cap open ios
```

In Xcode, select your signing team for `App` and `ShareExtension`, set their bundle IDs for your account, and set `FOLIOLE_SHARE_APP_GROUP` to an App Group registered to that team. Select a connected iPhone and choose **Product → Build** (or **Run** to install it). To export an IPA, choose **Product → Archive** and export it from Organizer.
