import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncObjectsResult,
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

async function testRecordsBacklogBytes() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    remainingAttachmentResourceBytes: 3145728,
    remainingAttachmentResourceCount: 2,
    remainingContentBlobBytes: 5242880,
    remainingContentBlobCount: 5
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
    message: 'Sync checked; 5 topic bodies (5.0 MB) and 2 attachment files (3.0 MB) left to download.',
    status: 'skipped'
  }));
}

async function testRecordsDownloadedResourcesForPass() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async (_endpointUrl, options) => {
    options?.onProgress?.({
      completed: 1,
      completedBytes: 1048576,
      phase: 'content',
      total: 6,
      totalBytes: 6291456
    });
    return createSyncObjectsResult({
      remainingContentBlobBytes: 5242880,
      remainingContentBlobCount: 5,
      syncedContentBlobBytes: 1048576,
      syncedContentBlobHashes: ['hash-1'],
      syncedResourceElapsedMs: 8000
    });
  });
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

  expect(outcome).toBe('backlog');
  expect(setSyncProgress).toHaveBeenLastCalledWith({
    completed: 1,
    completedBytes: 1048576,
    phase: 'content',
    total: 6,
    totalBytes: 6291456
  });
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Sync made progress; downloaded 1 topic body (1.0 MB) in this sync in 8s; 5 topic bodies (5.0 MB) still downloading.',
    status: 'skipped'
  }));
}

async function testKeepsResourceErrorsVisibleWithoutFastRetry() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    contentBlobError: 'Topic body batch could not download any requested body.',
    remainingContentBlobCount: 5
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
  expect(setSyncProgress).not.toHaveBeenCalledWith(null);
  expect(setSyncProgress).toHaveBeenCalledWith({
    completed: 0,
    completedBytes: 0,
    contentBreakdown: undefined,
    failedBytes: undefined,
    failedCount: 0,
    mode: 'remaining',
    phase: 'content',
    total: 5,
    totalBytes: null
  });
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Sync checked; topic bodies could not download in this pass: Topic body batch could not download any requested body; 5 topic bodies left to download.',
    status: 'skipped'
  }));
}

async function testKeepsProgressVisibleWhenBacklogRemains() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    remainingAttachmentResourceCount: 2,
    remainingContentBreakdown: {
      activeTopicBodies: 1,
      dueReviewBodies: 2,
      externalDocumentBodies: 1,
      nestedTopicBodies: 3,
      topLevelTopicBodies: 1,
      topicBodies: 4
    },
    remainingContentBlobCount: 5
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

  expect(outcome).toBe('backlog');
  expect(setSyncProgress).not.toHaveBeenCalledWith(null);
  expect(setSyncProgress).toHaveBeenCalledWith({
    completed: 0,
    completedBytes: 0,
    contentBreakdown: {
      activeTopicBodies: 1,
      dueReviewBodies: 2,
      externalDocumentBodies: 1,
      nestedTopicBodies: 3,
      topLevelTopicBodies: 1,
      topicBodies: 4
    },
    failedBytes: undefined,
    failedCount: 0,
    mode: 'remaining',
    phase: 'content',
    total: 5,
    totalBytes: null
  });
}

async function testClearsProgressWhenBacklogIsDone() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const setSyncProgress = vi.fn();

  await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress,
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(setSyncProgress).toHaveBeenCalledWith(null);
}

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
    message: 'Sync made progress; downloaded 1 topic body in this sync',
    status: 'skipped'
  }));
}

describe('tryForegroundAutoSync resource progress', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('records remaining cache bytes and schedules a fast retry while backlog remains', testRecordsBacklogBytes);

  it('records downloaded resources when a pass makes progress', testRecordsDownloadedResourcesForPass);

  it('keeps resource errors visible without fast retry when the pass makes no progress', testKeepsResourceErrorsVisibleWithoutFastRetry);

  it('keeps sync progress visible and retries when a pass leaves idle resource backlog', testKeepsProgressVisibleWhenBacklogRemains);

  it('clears sync progress when the resource backlog is done', testClearsProgressWhenBacklogIsDone);

  it('does not use unknown resource counts as fast backlog retry evidence', testUnknownResourceCountsDoNotDriveFastBacklogRetry);

  it('continues quickly when resources moved in this pass', testProgressWithUnknownResourceCountsDoesNotDriveFastRetry);
});
