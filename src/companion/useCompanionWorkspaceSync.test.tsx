import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeSyncNodeConflictRecord } from '../../lib/platform/nativeSyncContract';
import type {
  CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult
} from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import {
  createConflictSnapshot,
  createSnapshot,
  createSyncObjectsResult,
  createSyncState
} from './useCompanionWorkspaceSync.testSupport';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionSyncNodeConflicts: vi.fn<() => Promise<NativeSyncNodeConflictRecord[]>>(async () => []),
  syncCompanionObjectsFromDesktop: vi.fn<(
    endpointUrl: string,
    options?: CompanionDesktopSyncOptions
  ) => Promise<CompanionDesktopSyncResult>>(async () => ({
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
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentBreakdown: undefined,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: 0,
    remainingFailedAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: 0,
    remainingContentBreakdown: undefined,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: 0,
    remainingFailedContentBlobBytes: null,
    remainingFailedContentBlobCount: 0,
    remainingStructureChangeCount: 0,
    requestedObjectIds: [],
    syncedAttachmentIds: [],
    syncedAttachmentResourceBytes: 0,
    syncedContentBlobBytes: 0,
    syncedContentBlobHashes: [],
    syncedResourceElapsedMs: 0
  }))
}));
const workspaceSyncMock = vi.hoisted(() => ({
  loadCompanionReadableArticle: vi.fn<() => Promise<CompanionReadableArticle | null>>(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn(),
  resolveReachableCompanionWorkspaceSyncEndpoint: vi.fn(async (endpointUrl: string) => endpointUrl)
}));
const schedulerSettingsMock = vi.hoisted(() => ({ hydrate: vi.fn(async () => undefined) }));

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
  resolveReachableCompanionWorkspaceSyncEndpoint: workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoint,
  saveCompanionSyncOnboardingStatus: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));
vi.mock('./companionReviewSchedulerSettingsHydration', () => ({
  hydrateCompanionReviewSchedulerSettings: schedulerSettingsMock.hydrate
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
    refreshPairingState: vi.fn(),
    requestPairing: vi.fn()
  })
}));

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
  workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoint.mockImplementation(async (endpointUrl) => endpointUrl);
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
  expect(schedulerSettingsMock.hydrate).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.pullFromDesktop('http://10.0.2.2:38641');
  });

  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641',
    expect.objectContaining({ onStructureSynced: expect.any(Function) })
  );
  expect(workspaceSyncMock.loadCompanionWorkspaceSyncState).toHaveBeenCalledTimes(2);
  expect(schedulerSettingsMock.hydrate).toHaveBeenCalledTimes(2);
  expect(result.current.readableArticle?.nodeId).toBe('topic-1');
  expect(result.current.status).toBe('idle');
}

async function testManualSyncRefreshesConflictCount() {
  syncObjectsMock.loadCompanionSyncNodeConflicts
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

async function testManualSyncContinuesResourceBacklog() {
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

  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2);
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenLastCalledWith(
    'http://10.0.2.2:38641',
    expect.objectContaining({ resourcesOnly: true })
  );
  expect(result.current.status).toBe('idle');
}

describe('useCompanionWorkspaceSync', () => {
  beforeEach(resetCompanionWorkspaceSyncMocks);

  it('refreshes local state and readable article after manual stream sync', testManualSyncRefreshesReadableArticle);

  it('refreshes the visible sync conflict count after manual sync', testManualSyncRefreshesConflictCount);

  it('continues a decreasing manual resource backlog', testManualSyncContinuesResourceBacklog);
});
