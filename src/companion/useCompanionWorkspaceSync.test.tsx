import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

const syncObjectsMock = vi.hoisted(() => ({
  syncCompanionObjectsFromDesktop: vi.fn(async () => undefined)
}));
const workspaceSyncMock = vi.hoisted(() => ({
  loadCompanionReadableArticle: vi.fn<() => Promise<CompanionReadableArticle | null>>(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn()
}));

vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);
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

describe('useCompanionWorkspaceSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workspaceSyncMock.loadCompanionWorkspaceSyncState.mockResolvedValue(createSyncState(null));
    workspaceSyncMock.recordCompanionWorkspaceSyncEvent
      .mockResolvedValueOnce(createSyncState(null))
      .mockResolvedValueOnce(createSyncState(createSnapshot()));
    workspaceSyncMock.loadCompanionReadableArticle.mockResolvedValue({
      content: '# Synced topic\n\nBody',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Synced topic'
    });
  });

  it('refreshes local state and readable article after manual stream sync', async () => {
    const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
    const { result } = renderHook(() => useCompanionWorkspaceSync({
      booted_at: '2026-04-25T09:00:00.000Z',
      database_path: 'foliole-companion.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    }));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    await act(async () => {
      await result.current.pullFromDesktop('http://10.0.2.2:38641');
    });

    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
    expect(result.current.state.workspace_snapshot?.activeNodeId).toBe('topic-1');
    expect(result.current.readableArticle?.nodeId).toBe('topic-1');
    expect(result.current.status).toBe('idle');
  });
});
