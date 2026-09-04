import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runMacosA5Action } from './macos-a5-dev.mjs';
import {
  macosA5ActionEnv, macosA5ErrorEvidence, macosA5ParallelDesktopEnv
} from './macos-a5-extended-actions.mjs';
import { runMacosA5ProductBootstrap } from './macos-a5-product-bootstrap.mjs';

describe('macOS fixed A5 development entry', () => {
  it('lets only formal hidden desktop actions bypass the ordinary instance lock', () => {
    expect(macosA5ActionEnv({ BASE: 'kept' }, true, true)).toEqual({
      BASE: 'kept', FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1'
    });
    expect(macosA5ActionEnv({ BASE: 'kept' }, false, true)).toEqual({ BASE: 'kept' });
  });

  it('rejects arbitrary actions before touching ADB', async () => {
    await expect(runMacosA5Action('shell', '/repo')).rejects.toThrow(/Usage:/);
  });

  it('retires the mixed pair-sync entry while keeping the credential feature action', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const registry = fs.readFileSync('scripts/android/macos-a5-action-registry.mjs', 'utf8');
    const preflight = fs.readFileSync('scripts/android/macos-a5-pair-sync-preflight.mjs', 'utf8');
    expect(registry).not.toContain("'pair-sync'");
    expect(registry).toContain("'pair-credentials'");
    expect(preflight).toContain('Fixed A5 no longer matches the authorized pair-switch state.');
    expect(source).not.toContain("process.argv[3]");
  });

  it('exposes existing Sync Group sync without accepting an endpoint', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const dispatcher = fs.readFileSync('scripts/android/macos-a5-action-dispatch.mjs', 'utf8');
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    expect(dispatcher).toContain("'sync-existing'");
    expect(extended).toContain('args.assertFixed();');
    const block = extended.slice(
      extended.indexOf('export async function runMacosA5ExistingSyncEntry'),
      extended.indexOf('export async function runMacosA5SyncGroupRejoinEntry')
    );
    expect(extended).toContain('readiness.syncGroupCredentialsPresent === true');
    expect(extended).toContain('readiness.syncGroupRemotePeerFingerprint');
    expect(extended).toContain("args.protectData('backup'");
    expect(extended).toContain('runMacosA5ExistingSyncPreflight');
    expect(extended).toContain('proveMacosA5ExistingSyncContinuation');
    expect(block).not.toContain('runMacosA5PairSync');
    expect(block).not.toContain('credentialRepairRequired');
    expect(source).not.toContain('process.argv[3]');
  });

  it('exposes one bounded system entry convergence journey', () => {
    const dispatcher = fs.readFileSync('scripts/android/macos-a5-action-dispatch.mjs', 'utf8');
    const registry = fs.readFileSync('scripts/android/macos-a5-action-registry.mjs', 'utf8');
    const action = fs.readFileSync('scripts/android/macos-a5-system-entry-sync-action.mjs', 'utf8');
    expect(registry).toContain("'system-entry-sync'");
    expect(dispatcher).toContain('runMacosA5SystemEntrySyncEntry');
    expect(action).toContain("session.invoke('save_system_entry_display_names'");
    expect(action).toContain('inspectA5SystemEntryDisplayName');
    expect(action).toContain("session.invoke('save_system_entry_display_names', { payload: baseline })");
  });

  it('exposes a read-only frozen hidden desktop provenance action', () => {
    const dispatcher = fs.readFileSync('scripts/android/macos-a5-action-dispatch.mjs', 'utf8');
    const registry = fs.readFileSync('scripts/android/macos-a5-action-registry.mjs', 'utf8');
    expect(registry).toContain("'hidden-desktop-status'");
    expect(dispatcher).toContain('runMacosA5HiddenDesktopStatusEntry');
  });

  it('maintains local storage and reuses one hidden Electron cache entry', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    expect(source).toContain("prepareCacheEntry({ entryName: 'native-hidden-electron'");
    expect(source).toContain('FOLIOLE_SHARED_CACHE_ROOT: sharedCacheRoot');
    expect(source).toContain('maintainBeforeProduction({ rootDir: repoRoot })');
  });

  it('exposes only explicitly authorized fixed maintenance routes', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const dispatcher = fs.readFileSync('scripts/android/macos-a5-action-dispatch.mjs', 'utf8');
    const registry = fs.readFileSync('scripts/android/macos-a5-action-registry.mjs', 'utf8');
    const leave = fs.readFileSync('scripts/android/macos-a5-leave-sync-group-entry.mjs', 'utf8');
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    const generic = fs.readFileSync('scripts/sync-group/multi-device-sync-stage-actions.mjs', 'utf8');
    expect(registry).toContain("'leave-sync-group'");
    expect(dispatcher).toContain('runMacosA5LeaveSyncGroupEntry');
    expect(leave).toContain('collectCredentialProtectedReadiness');
    expect(leave).toContain('leaveJoinedEmptyCredentialSession');
    expect(dispatcher).toContain("'clear-app-data'");
    expect(dispatcher).toContain('runMacosA5ClearAppDataEntry');
    expect(extended).toContain("['-s', args.serial, 'shell', 'pm', 'clear', APP_ID]");
    expect(extended).toContain("action: 'activate-participation'");
    expect(extended).toContain('installMain: false');
    expect(extended).toContain('readiness.nodeCount !== 0');
    expect(generic).not.toContain("action: 'clear-app-data'");
    expect(source).not.toContain('process.argv[3]');
  });

  it('keeps fixed Leave independent from the T132 rejoin journey', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const dispatcher = fs.readFileSync('scripts/android/macos-a5-action-dispatch.mjs', 'utf8');
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    expect(dispatcher).toContain("'sync-group-rejoin'");
    expect(dispatcher).toContain('runMacosA5LeaveSyncGroupEntry');
    expect(source).not.toContain('process.argv[3]');
    expect(extended).toContain('runMacosA5SyncGroupMaintenance({');
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
    runMacosA5ProductBootstrap({ adb: '/adb', buildRoot: '/repo' }, (command, args) => {
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
    const dispatcher = fs.readFileSync('scripts/android/macos-a5-action-dispatch.mjs', 'utf8');
    const statusBlock = dispatcher.slice(
      dispatcher.indexOf("if (action === 'status')"),
      dispatcher.indexOf("if (action === 'sync-group-stopped-status')")
    );

    expect(statusBlock.indexOf('pairingReadiness(paths)')).toBeGreaterThan(-1);
    expect(statusBlock.indexOf('pairingReadiness(paths)')).toBeLessThan(statusBlock.indexOf('readiness(paths)'));
  });

  it('offers one fixed stopped status for a consistent T132 database snapshot', () => {
    const dispatcher = fs.readFileSync('scripts/android/macos-a5-action-dispatch.mjs', 'utf8');
    const block = dispatcher.slice(dispatcher.indexOf("if (action === 'sync-group-stopped-status')"),
      dispatcher.indexOf("if (action === 'deploy')"));
    expect(block).toContain('runMacosA5SettledStoppedStatus');
    expect(block).not.toContain("'install'");
    const extended = fs.readFileSync('scripts/android/macos-a5-extended-actions.mjs', 'utf8');
    const settled = extended.slice(extended.indexOf('runMacosA5SettledStoppedStatus'),
      extended.indexOf('runMacosA5ClearAppDataEntry'));
    expect(settled.match(/'force-stop'/gu)).toHaveLength(2);
    expect(settled).toContain('delay(90_000)');
    expect(settled).toContain('openMacosPairSyncDesktopSession');
    expect(settled.lastIndexOf("'force-stop'")).toBeLessThan(settled.indexOf('readiness(args.paths)'));
  });

  it('protects data without requiring the Capture acceptance workspace during deploy', () => {
    const source = fs.readFileSync('scripts/android/macos-a5-dev.mjs', 'utf8');
    const deployBlock = source.slice(
      source.indexOf('async function deploy('), source.indexOf('export async function protectData')
    );

    expect(deployBlock.indexOf("'backup'")).toBeLessThan(deployBlock.indexOf("'install', '-r'"));
    expect(deployBlock.indexOf("'check'")).toBeGreaterThan(deployBlock.indexOf("'install', '-r'"));
    expect(deployBlock).not.toContain('readiness(paths)');
  });
});
