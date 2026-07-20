import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncObjectsResult,
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

async function testRecordsPushFailureWithoutFailingPull() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    localDirtyCount: 1,
    pushError: 'Desktop sync target returned 500 for /companion/sync-push.',
    remainingAttachmentResourceCount: 0,
    remainingContentBlobCount: 0
  }));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

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
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'stage_finished',
    message: 'Device changes were not sent; Desktop sync target returned 500 for /companion/sync-push.',
    result: 'partial',
    status: 'completed'
  }));
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'run_finished',
    message: 'Device changes were not sent: Desktop sync target returned 500 for /companion/sync-push.',
    status: 'skipped'
  }));
}

async function testRecordsPushConflictWithoutCompleting() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    localDirtyCount: 2,
    pushConflictCount: 1,
    pushRejectedCount: 1,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobCount: 0
  }));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

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
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'stage_finished',
    message: 'Device changes were not sent; 2 changes were rejected or conflicted by desktop.',
    result: 'partial',
    status: 'completed'
  }));
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'run_finished',
    message: '2 device changes were not sent after desktop rejected or conflicted them.',
    status: 'skipped'
  }));
}

describe('tryForegroundAutoSync push outcomes', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('records push failure without marking the pull pass failed', testRecordsPushFailureWithoutFailingPull);

  it('records push conflicts without marking the pass completed', testRecordsPushConflictWithoutCompleting);
});
