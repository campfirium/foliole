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
    message: 'All stages completed.',
    result: 'completed',
    kind: 'run_finished',
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
    kind: 'run_started',
    status: 'started'
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
    kind: 'run_finished',
    message: 'Topic list confirmation is still pending.',
    result: 'partial',
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
    kind: 'stage_finished',
    message: 'Android changes are waiting for desktop confirmation; 1 change pending.',
    result: 'blocked',
    status: 'skipped'
  }));
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'run_finished',
    message: 'Android changes are still waiting to settle.',
    result: 'blocked',
    status: 'skipped'
  }));
}

describe('tryForegroundAutoSync', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('uses stream sync directly without pulling the legacy workspace snapshot', testUsesStreamSyncDirectly);

  it('uses a remembered sync target when the active endpoint is missing', testUsesRememberedSyncTarget);

  it('records structure lag without marking the pass completed', testRecordsStructureLagWithoutCompleting);

  it('keeps sync progress visible when a pass leaves structure lag', testKeepsProgressVisibleWhenStructureLagRemains);

  it('does not record completed while local work is waiting', testDoesNotCompleteWhileLocalWorkIsWaiting);
});
