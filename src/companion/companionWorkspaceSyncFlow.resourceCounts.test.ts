import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncObjectsResult,
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

async function testUnknownResourceCountsDoNotDriveFastBacklogRetry() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    remainingAttachmentResourceCount: null,
    remainingContentBlobCount: null
  }));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const setSyncProgress = vi.fn();

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress,
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(outcome).toBe('skipped');
  expect(setSyncProgress).not.toHaveBeenCalledWith(expect.objectContaining({ phase: 'content' }));
  expect(setSyncProgress).not.toHaveBeenCalledWith(expect.objectContaining({ phase: 'attachment' }));
  expect(setSyncProgress).toHaveBeenLastCalledWith(null);
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Sync checked; resource backlog was not measured in this pass.',
    status: 'skipped'
  }));
}

async function testProgressWithUnknownResourceCountsDoesNotDriveFastRetry() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    remainingAttachmentResourceCount: null,
    remainingContentBlobCount: null,
    syncedContentBlobHashes: ['hash-1']
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

  expect(outcome).toBe('backlog');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'stage_finished',
    message: 'Topic bodies downloaded; 1 topic body.',
    status: 'completed'
  }));
}

describe('tryForegroundAutoSync resource count boundaries', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('does not use unknown resource counts as fast backlog retry evidence', testUnknownResourceCountsDoNotDriveFastBacklogRetry);

  it('continues quickly when resources moved in this pass', testProgressWithUnknownResourceCountsDoesNotDriveFastRetry);
});
