import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeSyncNodeConflictRecord } from '../../lib/platform/nativeSyncContract';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionSyncNodeConflicts: vi.fn<() => Promise<NativeSyncNodeConflictRecord[]>>(async () => []),
  syncCompanionObjectsFromDesktop: vi.fn(async () => ({
    attachmentResourceError: null,
    contentBlobError: null,
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushConflictCount: 0,
    pushError: null,
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobCount: 0,
    remainingStructureChangeCount: 0
  }))
}));
const workspaceSyncMock = vi.hoisted(() => ({
  loadCompanionReadableArticle: vi.fn<() => Promise<CompanionReadableArticle | null>>(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn()
}));

vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);
vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionSyncNodeConflicts: syncObjectsMock.loadCompanionSyncNodeConflicts
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: workspaceSyncMock.loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState: workspaceSyncMock.loadCompanionWorkspaceSyncState,
  persistCompanionWorkspaceSnapshot: vi.fn(),
  recordCompanionWorkspaceSyncEvent: workspaceSyncMock.recordCompanionWorkspaceSyncEvent,
  removeCompanionWorkspaceSyncRememberedTarget: vi.fn(),
  saveCompanionSyncOnboardingStatus: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));
vi.mock('./useCompanionWorkspaceAutoSync', () => ({
  useForegroundAutoSync: vi.fn()
}));
vi.mock('./useCompanionWorkspacePairing', () => ({
  useCompanionWorkspacePairing: () => ({
    cancelPairing: vi.fn(),
    checkDesktop: vi.fn(),
    completePairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      paired_at: '2026-04-25T09:00:00.000Z'
    },
    pairingStatus: 'idle',
    pendingPairRequest: null,
    requestPairing: vi.fn()
  })
}));

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    nodesById: {
      'topic-1': {
        anchorLink: null,
        content: '# Synced topic\n\nBody',
        createdAt: '2026-04-25T09:00:00.000Z',
        hideTitleHeading: false,
        id: 'topic-1',
        isTitleManual: false,
        kind: 'topic',
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Synced topic',
        updatedAt: '2026-04-25T09:05:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function createSyncState(snapshot: WorkspaceSnapshot | null) {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: snapshot ? '2026-04-25T09:06:00.000Z' : null,
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: snapshot
  };
}

function createSyncObjectsResult(overrides: Record<string, unknown> = {}) {
  return {
    attachmentResourceError: null,
    contentBlobError: null,
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushConflictCount: 0,
    pushError: null,
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobCount: 0,
    remainingStructureChangeCount: 0,
    syncedAttachmentIds: [],
    syncedContentBlobHashes: [],
    ...overrides
  };
}

function createConflictSnapshot(title: string): NativeSyncNodeConflictRecord['snapshot'] {
  return {
    anchor_link: null,
    attachments: [],
    content: '',
    created_at: '2026-04-25T09:00:00.000Z',
    deleted_at: null,
    desired_retention: null,
    hide_title_heading: false,
    id: title.toLowerCase(),
    image_regions: null,
    is_title_manual: false,
    kind: 'topic',
    opening_text: null,
    parent_id: null,
    position: null,
    priority: null,
    reveal: null,
    title,
    updated_at: '2026-04-25T09:06:00.000Z',
    virtual_filter: null
  };
}

function resetCompanionWorkspaceSyncMocks() {
  vi.resetAllMocks();
  workspaceSyncMock.loadCompanionWorkspaceSyncState
    .mockResolvedValueOnce(createSyncState(null))
    .mockResolvedValue(createSyncState(createSnapshot()));
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementation(async (_endpointUrl, options) => {
    await options?.onStructureSynced?.();
    return createSyncObjectsResult();
  });
  syncObjectsMock.loadCompanionSyncNodeConflicts.mockResolvedValue([]);
  workspaceSyncMock.recordCompanionWorkspaceSyncEvent
    .mockResolvedValueOnce(createSyncState(null))
    .mockResolvedValueOnce(createSyncState(createSnapshot()));
    workspaceSyncMock.loadCompanionReadableArticle.mockResolvedValue({
      content: '# Synced topic\n\nBody',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      persistedNodeViewState: null,
      pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: 'Synced topic'
  });
}

function renderCompanionWorkspaceSyncHook(useCompanionWorkspaceSync: typeof import('./useCompanionWorkspaceSync').useCompanionWorkspaceSync) {
  return renderHook(() => useCompanionWorkspaceSync({
    booted_at: '2026-04-25T09:00:00.000Z',
    database_path: 'foliole-companionSQLite.db',
    database_ready: true,
    device_id: 'android-test-device',
    runtime_kind: 'android-capacitor'
  }));
}

async function testManualSyncRefreshesReadableArticle() {
  const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
  const { result } = renderCompanionWorkspaceSyncHook(useCompanionWorkspaceSync);

  await waitFor(() => expect(result.current.status).toBe('idle'));
  await act(async () => {
    await result.current.pullFromDesktop('http://10.0.2.2:38641');
  });

  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641',
    expect.objectContaining({ includeResources: false, onStructureSynced: expect.any(Function) })
  );
  expect(workspaceSyncMock.loadCompanionWorkspaceSyncState).toHaveBeenCalledTimes(1);
  expect(result.current.readableArticle?.nodeId).toBe('topic-1');
  expect(result.current.status).toBe('idle');
}

async function testManualSyncRefreshesConflictCount() {
  syncObjectsMock.loadCompanionSyncNodeConflicts
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        conflict_version_id: 'phone#1',
        content_hash: null,
        device_id: 'android-test-device',
        object_id: 'topic-1',
        parent_version_id: null,
        snapshot: createConflictSnapshot('Topic 1'),
        updated_at: '2026-04-25T09:06:00.000Z'
      },
      {
        conflict_version_id: 'phone#2',
        content_hash: null,
        device_id: 'android-test-device',
        object_id: 'topic-2',
        parent_version_id: null,
        snapshot: createConflictSnapshot('Topic 2'),
        updated_at: '2026-04-25T09:06:00.000Z'
      }
    ]);
  const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
  const { result } = renderCompanionWorkspaceSyncHook(useCompanionWorkspaceSync);

  await waitFor(() => expect(result.current.status).toBe('idle'));
  await act(async () => {
    await result.current.pullFromDesktop('http://10.0.2.2:38641');
  });

  expect(result.current.syncConflictCount).toBe(2);
}

async function testManualSyncRecordsOneBoundedResourceBacklogPass() {
  syncObjectsMock.syncCompanionObjectsFromDesktop
    .mockResolvedValueOnce(createSyncObjectsResult({
      remainingContentBlobCount: 1,
      syncedContentBlobHashes: ['hash-1']
    }))
    .mockResolvedValueOnce(createSyncObjectsResult());
  workspaceSyncMock.recordCompanionWorkspaceSyncEvent
    .mockResolvedValue(createSyncState(createSnapshot()));
  const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
  const { result } = renderCompanionWorkspaceSyncHook(useCompanionWorkspaceSync);

  await waitFor(() => expect(result.current.status).toBe('idle'));
  await act(async () => {
    await result.current.pullFromDesktop('http://10.0.2.2:38641');
  });

  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('idle');
}

describe('useCompanionWorkspaceSync', () => {
  beforeEach(resetCompanionWorkspaceSyncMocks);

  it('refreshes local state and readable article after manual stream sync', testManualSyncRefreshesReadableArticle);

  it('refreshes the visible sync conflict count after manual sync', testManualSyncRefreshesConflictCount);

  it('records one bounded manual resource backlog pass', testManualSyncRecordsOneBoundedResourceBacklogPass);
});
