import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncObjectsResult,
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

async function testUsesStreamSyncDirectly() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const setState = vi.fn();
  const setStatus = vi.fn();

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState,
    setSyncProgress: vi.fn(),
    setStatus,
    state: createSyncState()
  });

  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641',
    expect.objectContaining({ onStructureSynced: expect.any(Function) })
  );
  expect(outcome).toBe('completed');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Sync fully completed.',
    status: 'completed'
  }));
  expect(setState).toHaveBeenCalledWith(expect.objectContaining({ endpoint_url: 'http://10.0.2.2:38641' }));
  expect(setStatus).toHaveBeenLastCalledWith('idle');
}

async function testUsesRememberedSyncTarget() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState({
      endpoint_url: null,
      remembered_targets: ['http://192.168.1.44:38641']
    })
  });

  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
    'http://192.168.1.44:38641',
    expect.objectContaining({ onStructureSynced: expect.any(Function) })
  );
  expect(outcome).toBe('completed');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    endpointUrl: 'http://192.168.1.44:38641',
    status: 'started'
  }));
}

async function testKeepsUnreachableDesktopQuiet() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue(new Error('Desktop unreachable.'));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const setError = vi.fn();
  const setStatus = vi.fn();

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError,
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus,
    state: createSyncState()
  });

  expect(setError).not.toHaveBeenCalled();
  expect(outcome).toBe('failed');
  expect(setStatus).toHaveBeenLastCalledWith('idle');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Desktop unreachable.',
    status: 'failed'
  }));
}

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
    message: 'Sync pass finished; 5 topic bodies (5.0 MB) and 2 attachment files (3.0 MB) still caching.',
    status: 'skipped'
  }));
}

async function testRecordsStructureLagWithoutCompleting() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    remainingStructureChangeCount: 4
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
    message: 'Sync pass finished; 4 structure change(s) still applying.',
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

  await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress,
    setStatus: vi.fn(),
    state: createSyncState()
  });

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
    phase: 'content',
    total: 5,
    totalBytes: null
  });
}

async function testKeepsProgressVisibleWhenStructureLagRemains() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    remainingAttachmentResourceCount: 0,
    remainingContentBlobCount: 0,
    remainingStructureChangeCount: 4
  }));
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

  expect(setSyncProgress).not.toHaveBeenCalledWith(null);
  expect(setSyncProgress).toHaveBeenCalledWith({
    completed: 0,
    phase: 'structure',
    total: 4
  });
}

async function testDoesNotCompleteWhileLocalWorkIsWaiting() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    localDirtyCount: 1,
    pendingAckCount: 1,
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

  expect(outcome).toBe('backlog');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Sync pass finished; local changes are still waiting to settle.',
    status: 'skipped'
  }));
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

describe('tryForegroundAutoSync', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('uses stream sync directly without pulling the legacy workspace snapshot', testUsesStreamSyncDirectly);

  it('uses a remembered sync target when the active endpoint is missing', testUsesRememberedSyncTarget);

  it('does not surface unreachable desktop as a foreground error prompt', testKeepsUnreachableDesktopQuiet);

  it('records remaining cache bytes when a pass leaves body or attachment backlog', testRecordsBacklogBytes);

  it('records structure lag without marking the pass completed', testRecordsStructureLagWithoutCompleting);

  it('keeps sync progress visible when a pass leaves resource backlog', testKeepsProgressVisibleWhenBacklogRemains);

  it('keeps sync progress visible when a pass leaves structure lag', testKeepsProgressVisibleWhenStructureLagRemains);

  it('does not record completed while local work is waiting', testDoesNotCompleteWhileLocalWorkIsWaiting);

  it('clears sync progress when the resource backlog is done', testClearsProgressWhenBacklogIsDone);
});
