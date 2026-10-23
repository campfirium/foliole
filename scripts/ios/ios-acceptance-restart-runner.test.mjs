// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  launchAndReadAfterBridge,
  restartBridgeResultTimeoutMs,
  runAcceptanceRestart
} from './ios-acceptance-restart-runner.mjs';

describe('iOS acceptance restart runner', () => {
  it('waits longer for sync-pack runtime restart bridge results', () => {
    expect(restartBridgeResultTimeoutMs('sync-pack-runtime')).toBe(60_000);
    expect(restartBridgeResultTimeoutMs('state-writeback-runtime')).toBe(60_000);
    expect(restartBridgeResultTimeoutMs('content-resource-read')).toBe(60_000);
    expect(restartBridgeResultTimeoutMs('sync-group-signed-transport')).toBe(15_000);
  });

  it('uses the attempt bridge reader so absent result files retain their typed boundary', async () => {
    const bridge = { scenario: 'sync-group-signed-transport', status: 'passed' };
    const readBridgeResult = async () => bridge;
    await expect(runAcceptanceRestart({
      launch: () => {}, readBootstrap: () => ({ deviceId: 'ios-device', tableCount: 3 }),
      readBridgeResult, scenario: 'sync-group-signed-transport', terminate: () => {}
    })).resolves.toMatchObject({ secondBridge: bridge });
  });

  it('reads the app database only after the launch published its bridge result', async () => {
    const events = [];
    const result = await launchAndReadAfterBridge({
      launch: () => events.push('launch'),
      readBootstrap: () => { events.push('read-database'); return { deviceId: 'ios-device', tableCount: 3 }; },
      readBridgeResult: async () => {
        events.push('bridge-result');
        return { scenario: 'sync-pack-runtime', status: 'passed' };
      },
      scenario: 'sync-pack-runtime'
    });
    expect(events).toEqual(['launch', 'bridge-result', 'read-database']);
    expect(result.snapshot).toEqual({ deviceId: 'ios-device', tableCount: 3 });
  });

  it('surfaces a failed launch without touching the app database', async () => {
    let databaseReads = 0;
    await expect(runAcceptanceRestart({
      launch: () => {},
      readBootstrap: () => { databaseReads += 1; return { deviceId: 'ios-device', tableCount: 3 }; },
      readBridgeResult: async () => ({ error: 'content acceptance module failed to load', status: 'failed' }),
      scenario: 'sync-pack-runtime', terminate: () => {}
    })).rejects.toThrow('content acceptance module failed to load');
    expect(databaseReads).toBe(0);
  });
});
