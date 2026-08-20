import { beforeEach, describe, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    clearPairingCredentials: vi.fn()
  }
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

import { clearCompanionPairingCredentials } from './companionWorkspaceSync';
import { resetCompanionWorkspaceSyncTestState, storeWebPairingState } from './companionWorkspaceSync.testSupport';

beforeEach(() => {
  resetCompanionWorkspaceSyncTestState(capacitorMock);
  writerQueueMock.run.mockImplementation(async <T>(task: () => Promise<T>) => task());
});

describe('companionWorkspaceSync disconnect', () => {
  it('clears web preview pairing credentials', async () => {
    storeWebPairingState();

    await expect(clearCompanionPairingCredentials()).resolves.toMatchObject({ is_paired: false });

    expect(window.localStorage.getItem('foliole-companion-pairing-state')).toBeNull();
  });

  it('routes native disconnect through the serialized pairing bridge', async () => {
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.plugin.clearPairingCredentials.mockResolvedValue({
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null,
    });

    await expect(clearCompanionPairingCredentials()).resolves.toMatchObject({ is_paired: false });

    expect(capacitorMock.plugin.clearPairingCredentials).toHaveBeenCalledWith();
    expect(writerQueueMock.run).toHaveBeenCalledTimes(1);
  });
});
