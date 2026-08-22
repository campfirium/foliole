import { expect, it, vi } from 'vitest';

import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';

it('forwards an explicit acceptance transport without changing the daily default', async () => {
  const runPairSyncRecovery = vi.fn(async (options) => options);
  const openTransport = vi.fn();
  const closeTransport = vi.fn();
  const result = await runMacosA5PairSync({
    buildIdentity: 'pair-acceptance', closeTransport, deviceFingerprint: 'device-peer',
    env: {}, evidenceRoot: '.tmp/artifacts/test-a5-pair-sync-transport', execute: vi.fn(),
    openTransport, paths: { adb: '/adb', buildRoot: '/repo' },
    runPairSyncRecovery, serial: 'fixed-a5'
  });
  expect(result).toMatchObject({ closeTransport, openTransport });
});
