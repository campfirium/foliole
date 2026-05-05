import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    loadPairingState: vi.fn(),
    loadDiscoveryCandidates: vi.fn(),
    loadReadableArticle: vi.fn(),
    loadWorkspaceSyncState: vi.fn(),
    replaceWorkspaceNode: vi.fn(),
    replaceWorkspaceSnapshot: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(),
    savePairingCredentials: vi.fn(),
    signCompanionSyncRequest: vi.fn(),
    saveWorkspaceSyncEndpoint: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  loadCompanionWorkspaceVersion,
  persistCompanionWorkspaceSnapshot,
  pullCompanionWorkspaceSnapshot,
  removeCompanionWorkspaceSyncRememberedTarget,
  saveCompanionSyncOnboardingStatus,
  saveCompanionWorkspaceSyncEndpoint
} from './companionWorkspaceSync';
import {
  createStoredSyncState,
  createUpdatedStoredSnapshot,
  mockFetchJson,
  resetCompanionWorkspaceSyncTestState,
  storeWebPairingState
} from './companionWorkspaceSync.testSupport';

function registerEndpointPersistenceTest() {
  it('defaults new companion sync onboarding to pending', async () => {
    const state = await loadCompanionWorkspaceSyncState();

    expect(state.sync_onboarding_status).toBe('pending');
  });

  it('persists companion sync onboarding decisions in web preview mode', async () => {
    const state = await saveCompanionSyncOnboardingStatus('accepted');

    expect(state.sync_onboarding_status).toBe('accepted');
    expect((await loadCompanionWorkspaceSyncState()).sync_onboarding_status).toBe('accepted');
  });

  it('keeps accepted onboarding as setup-in-progress state', async () => {
    window.localStorage.setItem(
      'foliole-companion-workspace-sync-state',
      JSON.stringify({ sync_onboarding_status: 'accepted' })
    );

    expect((await loadCompanionWorkspaceSyncState()).sync_onboarding_status).toBe('accepted');
  });

  it('stores the sync endpoint in web preview mode', async () => {
    const state = await saveCompanionWorkspaceSyncEndpoint('http://10.0.2.2:38641/');

    expect(state.endpoint_url).toBe('http://10.0.2.2:38641');
    expect(state.remembered_targets).toEqual(['http://10.0.2.2:38641']);
    expect((await loadCompanionWorkspaceSyncState()).endpoint_url).toBe('http://10.0.2.2:38641');
  });

  it('moves the latest target to the front of remembered desktops', async () => {
    window.localStorage.setItem('foliole-companion-workspace-sync-state', JSON.stringify(createStoredSyncState()));

    const state = await saveCompanionWorkspaceSyncEndpoint('http://192.168.1.8:38641');

    expect(state.remembered_targets).toEqual(['http://192.168.1.8:38641', 'http://10.0.2.2:38641']);
  });

  it('removes a remembered desktop target and falls back when removing the current one', async () => {
    window.localStorage.setItem('foliole-companion-workspace-sync-state', JSON.stringify(createStoredSyncState()));

    const state = await removeCompanionWorkspaceSyncRememberedTarget('http://10.0.2.2:38641');

    expect(state.endpoint_url).toBe('http://192.168.1.8:38641');
    expect(state.remembered_targets).toEqual(['http://192.168.1.8:38641']);
  });
}

function registerSnapshotPullTest() {
  it('pulls the desktop workspace snapshot and persists it in web preview mode', async () => {
    storeWebPairingState();
    mockFetchJson({
      app_version: '0.1.0',
      exported_at: '2026-04-22T12:00:00.000Z',
      peer_id: 'desktop-local',
      workspace_snapshot: {
        activeNodeId: 'node-1',
        nodeOrder: ['node-1'],
        nodesById: {
          'node-1': {
            content: 'Hello from desktop',
            id: 'node-1',
            kind: 'item',
            title: 'Desktop node'
          }
        },
        trashedNodeIds: [],
        untitledSequenceByParent: {}
      }
    });

    const state = await pullCompanionWorkspaceSnapshot('http://10.0.2.2:38641');

    expect(state.last_synced_at).toBe('2026-04-22T12:00:00.000Z');
    expect(state.remembered_targets).toEqual(['http://10.0.2.2:38641']);
    expect(state.workspace_snapshot?.activeNodeId).toBe('node-1');
  });
}

function registerWorkspaceVersionTest() {
  it('loads the lightweight workspace version payload', async () => {
    storeWebPairingState();
    mockFetchJson({
      app_version: '0.1.0',
      exported_at: '2026-04-22T12:00:00.000Z',
      has_snapshot: true,
      peer_id: 'desktop-local',
      workspace_version: '2026-04-22T11:59:00.000Z'
    });

    const payload = await loadCompanionWorkspaceVersion('http://10.0.2.2:38641');
    const fetchMock = vi.mocked(fetch);

    expect(payload).toMatchObject({
      exported_at: '2026-04-22T12:00:00.000Z',
      has_snapshot: true,
      peer_id: 'desktop-local',
      workspace_version: '2026-04-22T11:59:00.000Z'
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'X-Device-Id': 'web-preview-device',
        'X-Nonce': expect.any(String),
        'X-Signature': expect.any(String),
        'X-Timestamp': expect.any(String)
      })
    });
  });
}

function registerReadableArticleTest() {
  it('resolves the readable article from the stored snapshot in web preview mode', async () => {
    window.localStorage.setItem('foliole-companion-workspace-sync-state', JSON.stringify(createStoredSyncState()));

    const article = await loadCompanionReadableArticle();

    expect(article).toEqual({
      content: 'Readable from local snapshot',
      hideTitleHeading: false,
      nodeId: 'node-1',
      textAnchorDecorations: [],
      title: 'Synced article'
    });
  });
}

function registerSnapshotPersistenceTest() {
  it('persists local companion snapshot updates in web preview mode', async () => {
    window.localStorage.setItem('foliole-companion-workspace-sync-state', JSON.stringify(createStoredSyncState()));

    const state = await persistCompanionWorkspaceSnapshot(createUpdatedStoredSnapshot());

    expect(state.workspace_snapshot?.nodesById['node-1']).toMatchObject({
      review: {
        due: '2026-04-25T12:00:00.000Z',
        lastReviewAt: '2026-04-22T12:30:00.000Z',
        reps: 2
      }
    });
    const persistedState = await loadCompanionWorkspaceSyncState();
    expect(persistedState.workspace_snapshot?.nodesById['node-1']).toMatchObject({
      review: {
        due: '2026-04-25T12:00:00.000Z'
      }
    });
  });

  it('persists native companion review updates through the single-node bridge', async () => {
    const updatedSnapshot = createUpdatedStoredSnapshot();
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.plugin.replaceWorkspaceNode.mockResolvedValue({
      endpoint_url: updatedSnapshot.endpointUrl,
      last_synced_at: updatedSnapshot.lastSyncedAt,
      remembered_targets: ['http://10.0.2.2:38641'],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: updatedSnapshot.workspaceSnapshot
    });

    await persistCompanionWorkspaceSnapshot({
      ...updatedSnapshot,
      rememberedTargets: ['http://10.0.2.2:38641'],
      changedNodeId: 'node-1'
    });

    expect(capacitorMock.plugin.replaceWorkspaceNode).toHaveBeenCalledWith({
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-22T12:00:00.000Z',
      node_id: 'node-1',
      node_snapshot_json: JSON.stringify(updatedSnapshot.workspaceSnapshot.nodesById['node-1'])
    });
    expect(capacitorMock.plugin.replaceWorkspaceSnapshot).not.toHaveBeenCalled();
  });
}

describe('companionWorkspaceSync', () => {
  beforeEach(() => resetCompanionWorkspaceSyncTestState(capacitorMock));
  registerEndpointPersistenceTest();
  registerSnapshotPullTest();
  registerWorkspaceVersionTest();
  registerReadableArticleTest();
  registerSnapshotPersistenceTest();
});
