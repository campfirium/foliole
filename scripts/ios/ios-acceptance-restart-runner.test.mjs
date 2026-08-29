// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { restartBridgeResultTimeoutMs, runAcceptanceRestart } from './ios-acceptance-restart-runner.mjs';

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
});
