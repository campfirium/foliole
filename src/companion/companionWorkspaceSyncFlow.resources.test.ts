import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncObjectsResult,
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

async function testRecordsBacklogBytesWithoutFastRetry() {
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

  expect(outcome).toBe('skipped');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Resource downloads are still pending.',
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
  const onContinuationModeChange = vi.fn();

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    onContinuationModeChange,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress,
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(outcome).toBe('backlog');
  expect(onContinuationModeChange).toHaveBeenCalledWith('resources-only');
  expect(setSyncProgress).toHaveBeenLastCalledWith({
    completed: 1,
    completedBytes: 1048576,
    phase: 'content',
    total: 6,
    totalBytes: 6291456
  });
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'stage_finished',
    message: 'Body files downloaded; 1 body file (1.0 MB).',
    result: 'completed',
    status: 'completed'
  }));
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'run_finished',
    message: 'Resource downloads made progress and will continue.',
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
    kind: 'stage_finished',
    message: 'Body downloads failed; Topic body batch could not download any requested body.',
    result: 'failed',
    status: 'failed'
  }));
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'run_finished',
    message: 'Sync checked; body downloads could not finish in this pass: Topic body batch could not download any requested body.',
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

  expect(outcome).toBe('skipped');
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

async function testUsesResourceOnlyContinuationMode() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

  await tryForegroundAutoSync({
    cancelled: () => false,
    continuationMode: 'resources-only',
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641',
    expect.objectContaining({ resourcesOnly: true })
  );
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

describe('tryForegroundAutoSync resource progress', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('records remaining cache bytes without fast retry when no resource progress is made', testRecordsBacklogBytesWithoutFastRetry);

  it('records downloaded resources when a pass makes progress', testRecordsDownloadedResourcesForPass);

  it('keeps resource errors visible without fast retry when the pass makes no progress', testKeepsResourceErrorsVisibleWithoutFastRetry);

  it('keeps sync progress visible without fast retry when idle resource backlog remains', testKeepsProgressVisibleWhenBacklogRemains);

  it('uses resource-only continuation mode on retry', testUsesResourceOnlyContinuationMode);

  it('clears sync progress when the resource backlog is done', testClearsProgressWhenBacklogIsDone);

});
