import { beforeEach, expect, it, vi } from 'vitest';

import { syncCompanionObjectsFromDesktop } from './companionDesktopSyncObjects';
import { createEmptyResourceStages } from './companionDesktopSyncResourceStages';

const runtime = vi.hoisted(() => ({ restore: vi.fn(), round: vi.fn(), host: vi.fn() }));
vi.mock('./companion/sync/syncGroupIdentityRestoreRound', () => ({
  runCompanionSyncIdentityRestoreRound: runtime.restore
}));
vi.mock('./companion/sync/syncGroupIdentityRound', () => ({
  runCompanionSyncIdentityRound: runtime.round
}));
vi.mock('./companion/runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosCompanionHostName: runtime.host
}));


beforeEach(() => {
  vi.resetAllMocks();
  runtime.host.mockResolvedValue('Phone');
  runtime.round.mockImplementation(async (_endpoint, _host, options) => {
    await options.onStructureSynced(2);
    return { received: { appliedObjects: 2 },
      resources: { stages: createEmptyResourceStages() } };
  });
});

it('refreshes only after the selected fixed restore and ordinary identity exchange complete', async () => {
  let adopt!: (value: { appliedObjects: number }) => void;
  runtime.restore.mockReturnValueOnce(new Promise(resolve => { adopt = resolve; }));
  const refreshed = vi.fn();
  const progress = vi.fn();
  const pending = syncCompanionObjectsFromDesktop('http://restore.test', {
    includeResources: false, restoreId: 'chosen', onStructureSynced: refreshed, onProgress: progress
  });
  await vi.waitFor(() => expect(runtime.restore).toHaveBeenCalledWith('http://restore.test', 'Phone', 'chosen'));
  expect(runtime.round).not.toHaveBeenCalled();
  expect(refreshed).not.toHaveBeenCalled();
  adopt({ appliedObjects: 5 });
  await expect(pending).resolves.toMatchObject({ appliedPackObjectCount: 7 });
  expect(progress).toHaveBeenCalledWith({ phase: 'structure', completed: 7, total: 7 });
  expect(refreshed).toHaveBeenCalledOnce();
});

it('leaves structure refresh and ordinary exchange pending when fixed restore fails', async () => {
  runtime.restore.mockRejectedValueOnce(new Error('sync_identity_restore_set_incomplete'));
  const refreshed = vi.fn();
  await expect(syncCompanionObjectsFromDesktop('http://restore-failure.test', {
    includeResources: false, restoreId: 'chosen', onStructureSynced: refreshed
  })).rejects.toThrow('sync_identity_restore_set_incomplete');
  expect(runtime.round).not.toHaveBeenCalled();
  expect(refreshed).not.toHaveBeenCalled();
});
