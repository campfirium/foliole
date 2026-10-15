import { beforeEach, expect, it, vi } from 'vitest';

import { createSyncObjectsResult, createSyncState, resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock, syncPlatformMock } from './companionWorkspaceSyncFlow.testHarness';

beforeEach(resetCompanionWorkspaceSyncFlowMocks);
async function sync() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  return tryForegroundAutoSync({ cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), state: createSyncState() });
}

it.each([
  { madeDatabaseProgress: true, appliedObjectIds: ['received'], remainingStructureChangeCount: 2 },
  { madeDatabaseProgress: true, pushedObjectIds: ['sent'], localDirtyCount: 2 },
  { transferredAttachmentCount: 1, remainingAttachmentResourceCount: 2 }
])('continues actual progress quickly: %j', async result => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult(result));
  expect(await sync()).toBe('backlog');
});

it.each([
  { remainingStructureChangeCount: 2 },
  { localDirtyCount: 2 },
  { pendingAckCount: 2 },
  { appliedObjectIds: ['unchanged'], remainingStructureChangeCount: 2 },
  { remainingAttachmentResourceCount: 2 }
])('backs off pending work without a transfer: %j', async result => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult(result));
  expect(await sync()).toBe('pending');
});

it.each(['completed', 'progress'] as const)('does not hide a busy peer behind another peer: %s', async other => {
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockResolvedValue([
    { endpointUrl: 'http://busy:38641' }, { endpointUrl: 'http://available:38641' }
  ]);
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValueOnce(new Error('sync_round_busy'))
    .mockResolvedValueOnce(createSyncObjectsResult(other === 'progress'
      ? { madeDatabaseProgress: true, appliedObjectIds: ['received'], remainingStructureChangeCount: 1 } : {}));
  expect(await sync()).toBe('pending');
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2);
});
