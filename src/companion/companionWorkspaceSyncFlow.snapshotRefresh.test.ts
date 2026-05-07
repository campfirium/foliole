import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncObjectsResult,
  createSyncState,
  createWorkspaceSnapshot,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

async function testRefreshesVisibleWorkspaceSnapshotAfterStructureSync() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const syncedSnapshot = createWorkspaceSnapshot('synced-topic');
  const setReadableArticle = vi.fn();
  const setState = vi.fn();
  syncPlatformMock.loadCompanionWorkspaceSyncState.mockResolvedValue(createSyncState({
    workspace_snapshot: syncedSnapshot
  }));
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async (_endpoint, options) => {
    await options.onStructureSynced?.();
    return createSyncObjectsResult();
  });

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle,
    setState,
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(outcome).toBe('completed');
  expect(syncPlatformMock.loadCompanionWorkspaceSyncState).toHaveBeenCalled();
  expect(syncPlatformMock.loadCompanionReadableArticle).toHaveBeenCalledWith(syncedSnapshot);
  expect(setState).toHaveBeenLastCalledWith(expect.objectContaining({
    workspace_snapshot: syncedSnapshot
  }));
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
    status: 'completed'
  }));
}

async function testDoesNotLeaveForegroundSyncStuckWhenSnapshotRefreshStalls() {
  vi.useFakeTimers();
  try {
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    syncPlatformMock.loadCompanionWorkspaceSyncState.mockReturnValue(new Promise(() => undefined));

    const outcome = tryForegroundAutoSync({
      cancelled: () => false,
      setError: vi.fn(),
      setReadableArticle: vi.fn(),
      setState: vi.fn(),
      setSyncProgress: vi.fn(),
      setStatus: vi.fn(),
      state: createSyncState()
    });
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(outcome).resolves.toBe('completed');
    expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'completed'
    }));
  } finally {
    vi.useRealTimers();
  }
}

async function testDoesNotFastRetryWhileTimedOutResourceStageMayStillBeClosingNativeWork() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValueOnce(createSyncObjectsResult({
    attachmentResourceError: 'Desktop sync timed out while fetching attachment resources.',
    remainingContentBlobCount: 1,
    remainingStructureChangeCount: 12
  }));

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(outcome).toBe('skipped');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
    status: 'skipped'
  }));
}

describe('companion stream sync snapshot refresh', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('refreshes the visible workspace snapshot after structure sync', testRefreshesVisibleWorkspaceSnapshotAfterStructureSync);

  it('does not leave foreground sync stuck when snapshot refresh stalls', testDoesNotLeaveForegroundSyncStuckWhenSnapshotRefreshStalls);

  it('does not fast retry while a timed out resource stage may still be closing native work', testDoesNotFastRetryWhileTimedOutResourceStageMayStillBeClosingNativeWork);
});
