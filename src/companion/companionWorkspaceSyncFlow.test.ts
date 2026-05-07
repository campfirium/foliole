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
    expect.objectContaining({ includeResources: false, onStructureSynced: expect.any(Function) })
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
    expect.objectContaining({ includeResources: false, onStructureSynced: expect.any(Function) })
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

  expect(setError).toHaveBeenCalledWith('Desktop unreachable.');
  expect(outcome).toBe('failed');
  expect(setStatus).toHaveBeenLastCalledWith('idle');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Desktop unreachable.',
    status: 'failed'
  }));
}

async function testRecordsStructureApplyFailureCause() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue(new Error(
    'Failed to apply companion desktop sync pack. ambiguous column name: hash'
  ));
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

  expect(outcome).toBe('failed');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Topic list sync failed: ambiguous column name: hash',
    status: 'failed'
  }));
}

async function testRecordsNativeBridgeFailureCause() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue({
    message: 'Desktop HTTP request failed. Cause: ConnectException: Failed to connect to /10.0.2.2:38641.'
  });
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

  expect(outcome).toBe('failed');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Desktop HTTP request failed. Cause: ConnectException: Failed to connect to /10.0.2.2:38641.',
    status: 'failed'
  }));
}

async function testRecordsMissingFailureDetails() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue({});
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

  await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Desktop sync failed: no error details were returned.',
    status: 'failed'
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
    message: 'Sync checked; 4 topic list changes are still applying.',
    status: 'skipped'
  }));
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
    mode: 'remaining',
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
    message: 'Sync checked; local changes are still waiting to settle.',
    status: 'skipped'
  }));
}

describe('tryForegroundAutoSync', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('uses stream sync directly without pulling the legacy workspace snapshot', testUsesStreamSyncDirectly);

  it('uses a remembered sync target when the active endpoint is missing', testUsesRememberedSyncTarget);

  it('surfaces unreachable desktop as a foreground error prompt', testKeepsUnreachableDesktopQuiet);

  it('records structure apply failure causes in sync activity', testRecordsStructureApplyFailureCause);

  it('records native bridge failure causes in sync activity', testRecordsNativeBridgeFailureCause);

  it('records when a failed sync returns no error details', testRecordsMissingFailureDetails);

  it('records structure lag without marking the pass completed', testRecordsStructureLagWithoutCompleting);

  it('keeps sync progress visible when a pass leaves structure lag', testKeepsProgressVisibleWhenStructureLagRemains);

  it('does not record completed while local work is waiting', testDoesNotCompleteWhileLocalWorkIsWaiting);
});
