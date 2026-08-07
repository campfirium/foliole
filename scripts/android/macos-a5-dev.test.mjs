import fs from 'node:fs';
import path from 'node:path';

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

    expect(paths.apk).toBe(path.join('/repo', 'android/app/build/outputs/apk/debug/app-debug.apk'));
    expect(paths.adb).toBe(path.join('/opt/homebrew/share/android-commandlinetools', 'platform-tools', 'adb'));
    expect(paths.gradle).toBe(path.join('/repo', 'android/gradlew'));
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

  it('exposes one fixed pair-sync action without accepting device arguments', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const preflight = fs.readFileSync('scripts/android/macos-a5-pair-sync-preflight.mjs', 'utf8');
    expect(source).toContain("'pair-sync'");
    expect(source).toContain('credentialRepairRequired: readinessState.credentialRepairRequired');
    expect(source).toContain('remotePeerFingerprint: readinessState.remotePeerFingerprint');
    expect(preflight).toContain('Fixed A5 no longer matches the authorized pair-switch state.');
    expect(source).not.toContain("process.argv[3]");
  });

  it('keeps bounded instrumentation output on failure', () => {
    expect(macosA5ErrorEvidence({ result: { output: 'INSTRUMENTATION_STATUS: stack=failed' } }))
      .toContain('stack=failed');
    expect(macosA5ErrorEvidence(new Error('missing'))).toBe('');
  });

  it('checks pairing credentials before workspace readiness in fixed status', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const statusBlock = source.slice(
      source.indexOf("if (action === 'status')"), source.indexOf("if (action === 'deploy')")
    );

    expect(statusBlock.indexOf('pairingReadiness(paths)')).toBeGreaterThan(-1);
    expect(statusBlock.indexOf('pairingReadiness(paths)')).toBeLessThan(statusBlock.indexOf('readiness(paths)'));
  });
});
