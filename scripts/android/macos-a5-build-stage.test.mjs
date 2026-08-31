import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { build, macosA5GradleEnv, macosA5Paths } from './macos-a5-dev.mjs';

describe('macOS fixed A5 build stage', () => {
  it('runs Web, Capacitor, and Gradle generation only from the selected build root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-build-order-'));
    const paths = {
      androidTestApk: path.join(
        root, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
      ),
      apk: path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'),
      buildRoot: root, cap: path.join(root, 'node_modules/.bin/cap'),
      gradle: path.join(root, 'android/gradlew')
    };
    const calls = [];
    const stages = [];
    try {
      build(paths, (command, args, options) => {
        calls.push({ args, command, cwd: options.cwd });
        if (command === paths.gradle) {
          fs.mkdirSync(path.dirname(paths.apk), { recursive: true });
          fs.writeFileSync(paths.apk, 'apk');
          fs.mkdirSync(path.dirname(paths.androidTestApk), { recursive: true });
          fs.writeFileSync(paths.androidTestApk, 'test-apk');
        }
      }, (stage) => stages.push(stage));
      expect(calls.map(({ command }) => command)).toEqual(['npm', paths.cap, paths.gradle]);
      expect(calls.map(({ cwd }) => cwd)).toEqual([root, root, path.join(root, 'android')]);
      expect(stages).toEqual(['web-build', 'capacitor-sync', 'gradle-build', 'apk-check']);
    } finally { fs.rmSync(root, { force: true, recursive: true }); }
  });

  it('uses repository APK paths and the fixed CLI toolchain', () => {
    const repoRoot = path.resolve('macos-a5-source-fixture');
    const paths = macosA5Paths(repoRoot);

    expect(paths.apk).toBe(path.join(repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'));
    expect(paths.androidTestApk).toBe(path.join(
      repoRoot, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
    ));
    expect(paths.adb).toBe(path.join('/opt/homebrew/share/android-commandlinetools', 'platform-tools', 'adb'));
    expect(paths.gradle).toBe(path.join(repoRoot, 'android/gradlew'));
    expect(paths).toMatchObject({
      buildRoot: repoRoot, sourceRepoRoot: repoRoot,
      controllerStateRoot: path.join(repoRoot, '.lab/internal/macos-a5-controller'),
      deviceBackupRoot: path.join(repoRoot, '.lab/internal/android-device-backups'),
      desktopDevLibrary: path.join(
        repoRoot, '.lab/internal/macos-a5-controller/desktop-library'
      )
    });
  });

  it('rejects a build that omits the Android test APK', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-build-test-apk-'));
    const paths = {
      androidTestApk: path.join(root, 'android/app/build/outputs/apk/androidTest/debug/test.apk'),
      apk: path.join(root, 'android/app/build/outputs/apk/debug/app.apk'),
      buildRoot: root, cap: '/cap', gradle: '/gradle'
    };
    try {
      expect(() => build(paths, (command) => {
        if (command !== paths.gradle) return;
        fs.mkdirSync(path.dirname(paths.apk), { recursive: true });
        fs.writeFileSync(paths.apk, 'apk');
      })).toThrow(`Android test APK was not produced: ${paths.androidTestApk}`);
    } finally { fs.rmSync(root, { force: true, recursive: true }); }
  });

  it('binds Gradle to the lightweight Homebrew SDK and JDK', () => {
    expect(macosA5GradleEnv({ PATH: '/bin' })).toMatchObject({
      ANDROID_HOME: '/opt/homebrew/share/android-commandlinetools',
      ANDROID_SDK_ROOT: '/opt/homebrew/share/android-commandlinetools',
      JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
      PATH: '/bin'
    });
  });
});
