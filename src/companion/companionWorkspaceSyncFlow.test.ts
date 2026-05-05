import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

const syncPlatformMock = vi.hoisted(() => ({
  loadCompanionReadableArticle: vi.fn(async () => null),
  recordCompanionWorkspaceSyncEvent: vi.fn()
}));

const syncObjectsMock = vi.hoisted(() => ({
  syncCompanionObjectsFromDesktop: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => syncPlatformMock);
vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);

function createSyncObjectsResult(overrides: Partial<CompanionDesktopSyncResult> = {}): CompanionDesktopSyncResult {
  return {
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedPackBlobCount: 0,
    appliedPackObjectCount: 0,
    appliedReviewOpIds: [],
    attachmentResourceError: null,
    changedObjectIds: [],
    contentBlobError: null,
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    pushConflictCount: 0,
    pushError: null,
    pushRejectedCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: 0,
    requestedObjectIds: [],
    syncedAttachmentIds: [],
    syncedContentBlobHashes: [],
    ...overrides
  };
}

function createSyncState(overrides: Partial<NativeCompanionWorkspaceSyncState> = {}): NativeCompanionWorkspaceSyncState {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-25T08:00:00.000Z',
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed',
    workspace_snapshot: null,
    ...overrides
  };
}

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
    message: 'Sync pass finished; 5 topic bodies (5.0 MB) and 2 attachment files (3.0 MB) still caching.',
    status: 'skipped'
  }));
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

  expect(outcome).toBe('skipped');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Sync pass finished; local changes are still waiting to settle.',
    status: 'skipped'
  }));
}

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
    message: 'Sync pass finished; device changes could not be sent: Desktop sync target returned 500 for /companion/sync-push.',
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
    message: 'Sync pass finished; 2 device change(s) need review before they can be sent.',
    status: 'skipped'
  }));
}

describe('tryForegroundAutoSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult());
    syncPlatformMock.recordCompanionWorkspaceSyncEvent.mockResolvedValue(createSyncState());
  });

  it('uses stream sync directly without pulling the legacy workspace snapshot', testUsesStreamSyncDirectly);

  it('uses a remembered sync target when the active endpoint is missing', testUsesRememberedSyncTarget);

  it('does not surface unreachable desktop as a foreground error prompt', testKeepsUnreachableDesktopQuiet);

  it('records remaining cache bytes when a pass leaves body or attachment backlog', testRecordsBacklogBytes);

  it('does not record completed while local work is waiting', testDoesNotCompleteWhileLocalWorkIsWaiting);

  it('records push failure without marking the pull pass failed', testRecordsPushFailureWithoutFailingPull);

  it('records push conflicts without marking the pass completed', testRecordsPushConflictWithoutCompleting);
});
