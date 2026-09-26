# Build from Source

Start from a [release tag](https://github.com/campfirium/foliole/releases). The `dev` branch contains unreleased work. Install Node.js 22.13+ (22.x), npm, Python 3, and your platform's native build tools, then run `npm ci` at the repository root.

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

## iOS

Install Xcode 26 on a Mac. Run:

```sh
npm run android:web:build
npx cap sync ios
npx cap open ios
```

In Xcode, select your signing team for `App` and `ShareExtension`, set their bundle IDs for your account, and set `FOLIOLE_SHARE_APP_GROUP` to an App Group registered to that team. Select a connected iPhone and choose **Product → Build** (or **Run** to install it). To export an IPA, choose **Product → Archive** and export it from Organizer.
