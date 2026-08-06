import { describe, expect, it } from 'vitest';

import {
  macosA5ErrorEvidence,
  macosA5GradleEnv,
  macosA5Paths,
  runMacosA5Action
} from './macos-a5-dev.mjs';

describe('macOS fixed A5 development entry', () => {
  it('uses the repository APK and fixed CLI toolchain', () => {
    const paths = macosA5Paths('/repo');

    expect(paths.apk).toBe('/repo/android/app/build/outputs/apk/debug/app-debug.apk');
    expect(paths.adb).toBe('/opt/homebrew/share/android-commandlinetools/platform-tools/adb');
    expect(paths.gradle).toBe('/repo/android/gradlew');
  });

  it('binds Gradle to the lightweight Homebrew SDK and JDK', () => {
    expect(macosA5GradleEnv({ PATH: '/bin' })).toMatchObject({
      ANDROID_HOME: '/opt/homebrew/share/android-commandlinetools',
      ANDROID_SDK_ROOT: '/opt/homebrew/share/android-commandlinetools',
      JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
      PATH: '/bin'
    });
  });

  it('rejects arbitrary actions before touching ADB', async () => {
    await expect(runMacosA5Action('shell', '/repo')).rejects.toThrow(/Usage:/);
  });

  it('keeps bounded instrumentation output on failure', () => {
    expect(macosA5ErrorEvidence({ result: { output: 'INSTRUMENTATION_STATUS: stack=failed' } }))
      .toContain('stack=failed');
    expect(macosA5ErrorEvidence(new Error('missing'))).toBe('');
  });
});
