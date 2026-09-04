// @vitest-environment node
/* global process */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createAcceptanceBuildArgs,
  resolveAcceptanceArtifactDir,
  verifyBootstrapSnapshots,
  waitForBootstrapSnapshot
} from './ios-bootstrap-acceptance.mjs';
import {
  parseBootstrapSnapshot,
  verifyAcceptanceAppSignature,
  verifyBridgeResult,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';
import { verifyContentResourceAcceptance } from './ios-content-resource-acceptance-runner.mjs';
import {
  createUpgradeBuildEnv,
} from './ios-database-upgrade-acceptance-runner.mjs';
import { verifyIosDatabaseUpgradeAcceptance } from './ios-database-upgrade-acceptance-snapshot.mjs';
import {
  createSyncGroupProviderCompileArgs,
  createSyncGroupProviderLaunch
} from './ios-sync-group-provider-runner.mjs';
import { parseStateWritebackSnapshot, verifyStateWritebackAcceptance } from './ios-state-writeback-acceptance-runner.mjs';
import { resolveAcceptanceScenario } from './ios-sync-pack-acceptance-runner.mjs';

describe('iOS bootstrap acceptance contract', () => {
  it('isolates Simulator evidence by scenario while reusing shared DerivedData', () => {
    expect(resolveAcceptanceArtifactDir('/repo', 'sync-pack-runtime')).toBe(
      path.join('/repo', '.tmp/artifacts/ios-bridge-acceptance/sync-pack-runtime')
    );
    expect(resolveAcceptanceArtifactDir('/repo', 'foreground-sync-lifecycle')).not.toBe(
      resolveAcceptanceArtifactDir('/repo', 'state-writeback-runtime')
    );
  });

  it('keeps Simulator acceptance locally signed', () => {
    const args = createAcceptanceBuildArgs('SIM-1');

    expect(args).toContain('PRODUCT_BUNDLE_IDENTIFIER=com.foliole.ios.bootstrap-acceptance');
    expect(args).toContain('platform=iOS Simulator,id=SIM-1');
    expect(args).toContain(path.join(
      process.cwd(), '.cache/ios-acceptance-build/DerivedData/PackageCache'
    ));
    expect(args).toContain('SWIFT_ACTIVE_COMPILATION_CONDITIONS=$(inherited) FOLIOLE_IOS_BRIDGE_ACCEPTANCE');
    expect(args).not.toContain('CODE_SIGNING_ALLOWED=NO');
  });

  it('requires the acceptance signature to use the isolated Bundle identifier', () => {
    expect(verifyAcceptanceAppSignature(
      'Identifier=com.foliole.ios.bootstrap-acceptance\nTeamIdentifier=not set\n',
      'com.foliole.ios.bootstrap-acceptance'
    )).toBe('com.foliole.ios.bootstrap-acceptance');
    expect(() => verifyAcceptanceAppSignature(
      'Identifier=com.foliole.ios\n', 'com.foliole.ios.bootstrap-acceptance'
    )).toThrow('Unexpected acceptance signature identifier');
  });

  it('uses one Electron main provider harness for every fixed-corpus scenario', () => {
    const syncGroup = createSyncGroupProviderLaunch('/repo', '/artifacts');
    const contentResource = createSyncGroupProviderLaunch('/repo', '/artifacts', 'content-resource-read');
    const stateWriteback = createSyncGroupProviderLaunch('/repo', '/artifacts', 'state-writeback-runtime');
    const foregroundLifecycle = createSyncGroupProviderLaunch('/repo', '/artifacts', 'foreground-sync-lifecycle');
    const syncPack = createSyncGroupProviderLaunch('/repo', '/artifacts', 'sync-pack-runtime');

    expect(syncGroup.command).toBe('/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
    expect(syncGroup.args.at(-1)).toBe('sync-group-signed-transport');
    expect(syncGroup.env).not.toBe(process.env);
    expect(syncGroup.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(contentResource.command).toBe(syncGroup.command);
    expect(contentResource.args.at(-1)).toBe('content-resource-read');
    expect(contentResource.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(stateWriteback.command).toBe(syncGroup.command);
    expect(stateWriteback.args.at(-1)).toBe('state-writeback-runtime');
    expect(stateWriteback.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(foregroundLifecycle.command).toBe(syncGroup.command);
    expect(foregroundLifecycle.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(syncPack.command).toBe(syncGroup.command);
    expect(syncPack.args.at(-1)).toBe('sync-pack-runtime');
    expect(syncPack.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it('compiles the provider before launching Electron main without endpoint injection', () => {
    const compileArgs = createSyncGroupProviderCompileArgs('/repo', '/artifacts');
    const launch = createSyncGroupProviderLaunch('/repo', '/artifacts', 'state-writeback-runtime');

    expect(compileArgs).toContain('--rewriteRelativeImportExtensions');
    expect(compileArgs).toContain('--noCheck');
    expect(launch.args[0]).toBe('/artifacts/service-dist/scripts/ios/ios-sync-group-provider-fixture.js');
    expect(launch.args).not.toContain('--experimental-strip-types');
    expect(launch.args.join(' ')).not.toContain('endpoint');
  });

  it('selects only the reviewed acceptance scenarios', () => {
    expect(resolveAcceptanceScenario()).toBe('sync-group-signed-transport');
    expect(resolveAcceptanceScenario('content-resource-read')).toBe('content-resource-read');
    expect(resolveAcceptanceScenario('database-upgrade-runtime')).toBe('database-upgrade-runtime');
    expect(resolveAcceptanceScenario('foreground-sync-lifecycle')).toBe('foreground-sync-lifecycle');
    expect(resolveAcceptanceScenario('state-writeback-runtime')).toBe('state-writeback-runtime');
    expect(resolveAcceptanceScenario('device-identity')).toBe('device-identity');
    expect(resolveAcceptanceScenario('sync-pack-runtime')).toBe('sync-pack-runtime');
    expect(resolveAcceptanceScenario('sync-group-discovery-events')).toBe('sync-group-discovery-events');
    expect(resolveAcceptanceScenario('sync-trigger-runtime')).toBe('sync-trigger-runtime');
    expect(() => resolveAcceptanceScenario('unknown')).toThrow('Unknown iOS acceptance scenario');
  });

  it('keeps database upgrade failure instrumentation out of normal builds', () => {
    expect(createUpgradeBuildEnv({}, false)).not.toHaveProperty('VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT');
    expect(createUpgradeBuildEnv({}, true).VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT).toBe('1');
  });

  it('rejects incomplete database upgrade rollback evidence', () => {
    expect(() => verifyIosDatabaseUpgradeAcceptance({
      failed: { status: 'passed' }, failedSnapshot: {}, first: {}, firstSnapshot: {},
      recovered: {}, recoveredSnapshot: {}, second: {}, secondSnapshot: {}
    }, (value) => value)).toThrow();
  });

  it('rejects state writeback evidence without confirmation cleanup', () => {
    const snapshot = parseStateWritebackSnapshot('[{"pending_ack_count":1}]');
    expect(() => verifyStateWritebackAcceptance({}, {}, snapshot, snapshot, {}))
      .toThrow('evidence is incomplete');
  });

  it('rejects content resource evidence when restart downloads again', () => {
    const first = { evidence: {}, phase: 'resources-synced', resource_sync: {} };
    const second = { evidence: {}, phase: 'resources-restored', resource_sync: null };
    expect(() => verifyContentResourceAcceptance(first, second, {}, {})).toThrow('evidence is incomplete');
  });

  it('accepts a stable database identity and required schema after restart', () => {
    const first = parseBootstrapSnapshot('ios-device-1\n3\n');
    const second = parseBootstrapSnapshot('ios-device-1\n3\n');

    expect(verifyBootstrapSnapshots(first, second)).toEqual({
      databaseReady: true,
      deviceId: 'ios-device-1',
      requiredTableCount: 3
    });
  });

  it('rejects an identity that changes after restart', () => {
    expect(() => verifyBootstrapSnapshots(
      { deviceId: 'ios-device-1', tableCount: 3 },
      { deviceId: 'ios-device-2', tableCount: 3 }
    )).toThrow('device identity changed');
  });

  it('waits through transient database states until bootstrap is semantically ready', async () => {
    const states = [
      new Error('database is locked'),
      { deviceId: '', tableCount: 1 },
      { deviceId: 'ios-device-1', tableCount: 3 }
    ];
    let launched = false;

    await expect(waitForBootstrapSnapshot(() => {
      const state = states.shift();
      if (state instanceof Error) throw state;
      return state;
    }, () => { launched = true; }, 500, 1)).resolves.toEqual({
      deviceId: 'ios-device-1',
      tableCount: 3
    });
    expect(launched).toBe(true);
  });

  it('fails after the bounded wait when bootstrap never becomes ready', async () => {
    await expect(waitForBootstrapSnapshot(
      () => ({ deviceId: '', tableCount: 1 }),
      () => {},
      5,
      1
    )).rejects.toThrow('device identity present=false, required tables=1');
  });

  it('accepts only a passed Sync Group transport scenario', () => {
    const result = {
      error: null,
      phase: 'join-observed',
      scenario: 'sync-group-signed-transport',
      status: 'passed'
    };
    expect(verifyBridgeResult(result)).toBe(result);
    expect(() => verifyBridgeResult({ ...result, status: 'failed', error: 'bridge rejected' }))
      .toThrow('bridge rejected');
  });

  it('persists a structured failure artifact even before a Simulator is selected', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ios-acceptance-'));
    try {
      writeAcceptanceFailure(directory, new Error('CoreSimulator unavailable'));
      expect(JSON.parse(fs.readFileSync(path.join(directory, 'failure.json'), 'utf8'))).toEqual({
        error: 'CoreSimulator unavailable',
        status: 'failed'
      });
    } finally {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  });
});
