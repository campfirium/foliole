import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncObjectsResult,
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

describe('companion stream sync snapshot refresh', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('does not block the terminal sync event on a full workspace snapshot refresh', async () => {
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    const setReadableArticle = vi.fn();
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async (_endpoint, options) => {
      await options.onStructureSynced?.();
      return createSyncObjectsResult();
    });

    const outcome = await tryForegroundAutoSync({
      cancelled: () => false,
      setError: vi.fn(),
      setReadableArticle,
      setState: vi.fn(),
      setSyncProgress: vi.fn(),
      setStatus: vi.fn(),
      state: createSyncState()
    });

    expect(outcome).toBe('completed');
    expect(syncPlatformMock.loadCompanionWorkspaceSyncState).not.toHaveBeenCalled();
    expect(syncPlatformMock.loadCompanionReadableArticle).toHaveBeenCalledWith();
    expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'completed'
    }));
  });

  it('does not fast retry while a timed out resource stage may still be closing native work', async () => {
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
  });
});
