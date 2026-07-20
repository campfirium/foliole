import { expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  loadSyncNodeConflicts: vi.fn(),
  registerPlugin: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: capacitorMock.registerPlugin
}));

capacitorMock.registerPlugin.mockReturnValue({
  loadSyncNodeConflicts: capacitorMock.loadSyncNodeConflicts
});

import { loadCompanionSyncNodeConflicts } from './companionSyncObjects';

it('treats Android-only conflict copies as absent on iOS', async () => {
  await expect(loadCompanionSyncNodeConflicts()).resolves.toEqual([]);
  expect(capacitorMock.loadSyncNodeConflicts).not.toHaveBeenCalled();
});
