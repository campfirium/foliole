import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  macosA5GradleEnv,
  macosA5Paths,
  runMacosA5Action
} from './macos-a5-dev.mjs';
import {
  macosA5ErrorEvidence, macosA5ParallelDesktopEnv
} from './macos-a5-extended-actions.mjs';
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

  it('starts and verifies the fixed ADB server before pair-sync readiness fans out', () => {
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    const block = extended.slice(
      extended.indexOf('export async function runMacosA5PairSyncEntry'),
      extended.indexOf('export async function runMacosA5ExistingSyncEntry')
    );

    expect(block.indexOf('args.assertFixed();')).toBeGreaterThan(-1);
    expect(block.indexOf('args.assertFixed();')).toBeLessThan(
      block.indexOf('resolveMacosA5PairSyncReadiness(args.paths)')
    );
  });

  it('exposes existing Sync Group sync without accepting an endpoint', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    expect(source).toContain("'sync-existing'");
    expect(extended).toContain('args.assertFixed();');
    expect(extended).toContain('credentialRepairRequired: false');
    expect(extended).toContain('existingPairing: true');
    expect(extended).toContain('readiness.syncGroupCredentialsPresent === true');
    expect(extended).toContain('readiness.syncGroupRemotePeerFingerprint');
    expect(extended).toContain("args.protectData('backup'");
    expect(extended).toContain('runMacosA5ExistingSyncPreflight');
    expect(extended).toContain('proveMacosA5ExistingSyncContinuation');
    expect(source).not.toContain('process.argv[3]');
  });

  it('exposes only the explicitly authorized fixed clear-data maintenance route', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    const generic = fs.readFileSync('scripts/sync-group/multi-device-sync-stage-actions.mjs', 'utf8');
    expect(source).not.toContain("'leave-sync-group'");
    expect(source).toContain("'clear-app-data'");
    expect(source).toContain('runMacosA5ClearAppDataEntry');
    expect(extended).toContain("['-s', args.serial, 'shell', 'pm', 'clear', APP_ID]");
    expect(extended).toContain("action: 'activate-participation'");
    expect(extended).toContain('installMain: false');
    expect(extended).toContain('readiness.nodeCount !== 0');
    expect(generic).toContain("action: 'clear-app-data'");
    expect(source).not.toContain('process.argv[3]');
  });

  it('exposes one fixed T132 rejoin journey without exposing raw Leave', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    expect(source).toContain("'sync-group-rejoin'");
    expect(source).not.toContain("'leave-sync-group'");
    expect(source).not.toContain('process.argv[3]');
    expect(extended).toContain('assertT132CredentialRecoveryBaseline');
    expect(extended).toContain("'force-stop', 'com.foliole.android'");
    expect(extended).toContain("args.protectData('backup'");
    expect(extended).toContain('runMacosA5SyncGroupRejoinJourney');
  });

  it('keeps the installed Foliole open while the fixed journey owns the default listener', () => {
    expect(macosA5ParallelDesktopEnv({ FOLIOLE_COMPANION_SYNC_PORT: '38641' })).toEqual({
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1', FOLIOLE_COMPANION_SYNC_PORT: '38641'
    });
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
    expect(calls[2][1]).toContain(path.join('/repo', 'scripts/android/verify-android-launch.mjs'));
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

  it('offers one fixed stopped status for a consistent T132 database snapshot', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const block = source.slice(source.indexOf("if (action === 'sync-group-stopped-status')"),
      source.indexOf("if (action === 'deploy')"));
    expect(block).toContain('runMacosA5SettledStoppedStatus');
    expect(block).not.toContain("'install'");
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    const settled = extended.slice(extended.indexOf('runMacosA5SettledStoppedStatus'),
      extended.indexOf('runMacosA5DatabasePerformanceEntry'));
    expect(settled.match(/'force-stop'/gu)).toHaveLength(2);
    expect(settled).toContain('delay(90_000)');
    expect(settled).toContain('openMacosPairSyncDesktopSession');
    expect(settled.lastIndexOf("'force-stop'")).toBeLessThan(settled.indexOf('readiness(args.paths)'));
  });

  it('protects data without requiring the Capture acceptance workspace during deploy', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const deployBlock = source.slice(
      source.indexOf('async function deploy(paths)'), source.indexOf('export async function protectData')
    );

    expect(deployBlock.indexOf("'backup'")).toBeLessThan(deployBlock.indexOf("'install', '-r'"));
    expect(deployBlock.indexOf("'check'")).toBeGreaterThan(deployBlock.indexOf("'install', '-r'"));
    expect(deployBlock).not.toContain('readiness(paths)');
  });
});
