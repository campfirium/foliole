import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  macosA5ErrorEvidence,
  macosA5GradleEnv,
  macosA5Paths,
  runMacosA5Action
} from './macos-a5-dev.mjs';
import { runMacosA5ProductBootstrap } from './macos-a5-product-bootstrap.mjs';

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
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    const preflight = fs.readFileSync('scripts/android/macos-a5-pair-sync-preflight.mjs', 'utf8');
    expect(source).toContain("'pair-sync'");
    expect(extended).toContain('credentialRepairRequired: readiness.credentialRepairRequired');
    expect(extended).toContain('remotePeerFingerprint: readiness.remotePeerFingerprint');
    expect(extended).toContain('resolveMacosA5PairSyncReadiness');
    expect(preflight).toContain('Fixed A5 no longer matches the authorized pair-switch state.');
    expect(source).not.toContain("process.argv[3]");
  });

  it('exposes existing Sync Group sync without accepting an endpoint', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    expect(source).toContain("'sync-existing'");
    expect(extended).toContain('FolioleCompanionWebViewAutomationTest#recoversPairingAndInitialSync');
    expect(extended).toContain('"pairingPath":"existing"');
    expect(source).not.toContain('process.argv[3]');
  });

  it('retires public T121 maintenance routes while the generic system owns its fixed action', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const generic = fs.readFileSync('scripts/sync-group/multi-device-sync-stage-actions.mjs', 'utf8');
    expect(source).not.toContain("'leave-sync-group'");
    expect(source).not.toContain("'clear-app-data'");
    expect(source).not.toContain('runMacosA5SyncGroupMaintenanceEntry');
    expect(generic).toContain("action: 'clear-app-data'");
    expect(source).not.toContain('process.argv[3]');
  });

  it('bootstraps only through the installed product before identity is rechecked', () => {
    const calls = [];
    runMacosA5ProductBootstrap({ adb: '/adb', repoRoot: '/repo' }, (command, args) => {
      calls.push([command, args]);
      return { status: 0 };
    });

    expect(calls[0]).toEqual(['/adb', [
      '-s', '87a33a4b', 'shell', 'am', 'force-stop', 'com.foliole.android'
    ]]);
    expect(calls[1][1]).toEqual([
      '-s', '87a33a4b', 'shell', 'am', 'start', '-n', 'com.foliole.android/.MainActivity'
    ]);
    expect(calls[2][1]).toContain('/repo/scripts/android/verify-android-launch.mjs');
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
