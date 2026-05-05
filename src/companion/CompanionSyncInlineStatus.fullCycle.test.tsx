import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { CompanionSyncInlineStatus } from './CompanionSyncInlineStatus';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionPendingSyncSummary: vi.fn(async () => ({ pendingCount: 0 }))
}));
const desktopSyncMock = vi.hoisted(() => ({
  syncCompanionObjectsFromDesktop: vi.fn(async () => ({
    appliedNodeIds: ['topic-1'],
    appliedObjectIds: ['node_reading:topic-1'],
    appliedReviewOpIds: [],
    changedObjectIds: ['topic-1'],
    pushedNodeIds: [],
    pushedObjectIds: ['topic-1'],
    pushedReviewOpIds: [],
    requestedObjectIds: []
  }))
}));
const workspaceSyncMock = vi.hoisted(() => ({
  loadCompanionReadableArticle: vi.fn<() => Promise<CompanionReadableArticle | null>>(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn()
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);
vi.mock('../shared/platform/companionDesktopSyncObjects', () => desktopSyncMock);
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: workspaceSyncMock.loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState: workspaceSyncMock.loadCompanionWorkspaceSyncState,
  persistCompanionWorkspaceSnapshot: vi.fn(),
  recordCompanionWorkspaceSyncEvent: workspaceSyncMock.recordCompanionWorkspaceSyncEvent,
  removeCompanionWorkspaceSyncRememberedTarget: vi.fn(),
  saveCompanionSyncOnboardingStatus: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));
vi.mock('./useCompanionWorkspaceAutoSync', () => ({ useForegroundAutoSync: vi.fn() }));
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

function createSnapshot(content: string): WorkspaceSnapshot {
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    nodesById: {
      'topic-1': {
        anchorLink: null,
        content,
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

function createBootstrapState(): NativeCompanionBootstrapState {
  return {
    booted_at: '2026-04-25T09:00:00.000Z',
    database_path: 'foliole-companion.db',
    database_ready: true,
    device_id: 'android-test-device',
    runtime_kind: 'android-capacitor'
  };
}

function SyncHarness() {
  const workspaceSync = useCompanionWorkspaceSync(createBootstrapState());
  return (
    <>
      <CompanionSyncInlineStatus workspaceSync={workspaceSync} />
      <article>{workspaceSync.readableArticle?.content ?? 'No article'}</article>
    </>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  workspaceSyncMock.loadCompanionWorkspaceSyncState.mockResolvedValue(createSyncState(createSnapshot('Old body')));
  workspaceSyncMock.recordCompanionWorkspaceSyncEvent
    .mockResolvedValueOnce(createSyncState(createSnapshot('Old body')))
    .mockResolvedValueOnce(createSyncState(createSnapshot('Updated body')));
  workspaceSyncMock.loadCompanionReadableArticle
    .mockResolvedValueOnce({ content: 'Old body', hideTitleHeading: false, nodeId: 'topic-1', textAnchorDecorations: [], title: 'Synced topic' })
    .mockResolvedValueOnce({ content: 'Updated body', hideTitleHeading: false, nodeId: 'topic-1', textAnchorDecorations: [], title: 'Synced topic' });
  syncObjectsMock.loadCompanionPendingSyncSummary.mockResolvedValue({ pendingCount: 1 });
});

it('clears pending sync status and refreshes readable content after a successful stream sync', async () => {
  render(<SyncHarness />);

  expect(await screen.findByText('1 change waiting to sync.')).toBeInTheDocument();
  syncObjectsMock.loadCompanionPendingSyncSummary.mockResolvedValue({ pendingCount: 0 });
  await act(async () => {
    screen.getByRole('button', { name: 'Sync now' }).click();
  });

  await waitFor(() => expect(screen.queryByLabelText('Sync status')).not.toBeInTheDocument());
  expect(screen.getByText('Updated body')).toBeInTheDocument();
  expect(desktopSyncMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
});
