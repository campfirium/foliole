import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  round: vi.fn(), restore: vi.fn(), summary: vi.fn(), hostName: vi.fn()
}));
vi.mock('../runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosCompanionHostName: runtime.hostName
}));
vi.mock('./syncGroupIdentityRound', () => ({
  runCompanionSyncIdentityRound: runtime.round
}));
vi.mock('./syncGroupIdentityRestoreRound', () => ({
  runCompanionSyncIdentityRestoreRound: runtime.restore
}));
vi.mock('../../companionDesktopSyncSummary', () => ({
  loadCompanionDesktopSyncSummary: runtime.summary
}));
vi.mock('./diagnostics/companionDesktopSyncTrace', () => ({
  traceCompanionSyncStep: (args: { task: () => Promise<unknown> }) => args.task()
}));

import { syncCompanionIdentityObjects } from './syncGroupIdentityCompanionResult';

it('reports a verified identity round through the companion result surface', async () => {
  vi.clearAllMocks();
  runtime.hostName.mockResolvedValue('Phone');
  runtime.round.mockResolvedValue({ received: { appliedObjects: 3 },
    resources: { syncedCount: 0 }, verifiedCandidateCount: 0 });
  runtime.summary.mockResolvedValue({ localDirtyCount: 0, pendingAckCount: 0,
    remainingContentBlobCount: 0, remainingAttachmentResourceCount: 0,
    remainingStructureChangeCount: 0 });
  const progress = vi.fn();
  const refreshed = vi.fn();

  const result = await syncCompanionIdentityObjects('http://peer', {
    onProgress: progress, onStructureSynced: refreshed
  });

  expect(runtime.round).toHaveBeenCalledWith('http://peer', 'Phone',
    { includeResources: true });
  expect(runtime.summary).toHaveBeenCalledWith('http://peer', 'identity-complete');
  expect(progress).toHaveBeenCalledWith({ completed: 3, phase: 'structure', total: 3 });
  expect(refreshed).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ appliedPackObjectCount: 3,
    remainingStructureChangeCount: 0, localDirtyCount: 0 });
});

it('restores the fixed set before the ordinary identity exchange', async () => {
  vi.clearAllMocks();
  runtime.hostName.mockResolvedValue('Phone');
  runtime.restore.mockResolvedValue({ appliedObjects: 5 });
  runtime.round.mockResolvedValue({ received: { appliedObjects: 2 } });
  runtime.summary.mockResolvedValue({ localDirtyCount: 0, pendingAckCount: 0,
    remainingContentBlobCount: 0, remainingAttachmentResourceCount: 0,
    remainingStructureChangeCount: 0 });
  const result = await syncCompanionIdentityObjects('http://peer', {
    restoreId: 'restore', includeResources: false
  });
  expect(runtime.restore).toHaveBeenCalledWith('http://peer', 'Phone', 'restore');
  expect(runtime.round).toHaveBeenCalledWith('http://peer', 'Phone',
    { includeResources: false });
  expect(runtime.restore.mock.invocationCallOrder[0]).toBeLessThan(
    runtime.round.mock.invocationCallOrder[0]!);
  expect(result.appliedPackObjectCount).toBe(7);
});
