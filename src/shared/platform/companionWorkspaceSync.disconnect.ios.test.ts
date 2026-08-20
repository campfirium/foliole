import { expect, it, vi } from 'vitest';

const writerQueue = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));
const nativePlugin = vi.hoisted(() => ({
  clearPairingCredentials: vi.fn(async () => ({
    device_id: null,
    device_kind: null,
    device_name: null,
    is_paired: false,
    paired_at: null,
  }))
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: vi.fn(() => nativePlugin)
}));
vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueue.run
}));

import { clearCompanionPairingCredentials } from './companionWorkspaceSync';

it('serializes iOS pairing removal through the native bridge', async () => {
  await expect(clearCompanionPairingCredentials()).resolves.toMatchObject({ is_paired: false });

  expect(nativePlugin.clearPairingCredentials).toHaveBeenCalledWith();
  expect(writerQueue.run).toHaveBeenCalledTimes(1);
});
