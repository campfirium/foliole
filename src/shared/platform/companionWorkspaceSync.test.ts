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
  loadCompanionDiscovery,
  loadCompanionPairingState,
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  loadCompanionWorkspaceVersion,
  pairCompanionWithDesktop,
  persistCompanionWorkspaceSnapshot,
  pullCompanionWorkspaceSnapshot,
  removeCompanionWorkspaceSyncRememberedTarget,
  requestCompanionPairing,
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
    const state = await saveCompanionSyncOnboardingStatus('dismissed');

    expect(state.sync_onboarding_status).toBe('dismissed');
    expect((await loadCompanionWorkspaceSyncState()).sync_onboarding_status).toBe('dismissed');
  });

  it('treats legacy accepted onboarding as pending', async () => {
    window.localStorage.setItem(
      'foliole-companion-workspace-sync-state',
      JSON.stringify({ sync_onboarding_status: 'accepted' })
    );

    expect((await loadCompanionWorkspaceSyncState()).sync_onboarding_status).toBe('pending');
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
      peer_id: 'desktop-local'
    });

    const payload = await loadCompanionWorkspaceVersion('http://10.0.2.2:38641');
    const fetchMock = vi.mocked(fetch);

    expect(payload).toMatchObject({
      exported_at: '2026-04-22T12:00:00.000Z',
      has_snapshot: true,
      peer_id: 'desktop-local'
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

function registerPairingTest() {
  it('discovers the desktop, requests pairing, and stores web preview credentials after approval', async () => {
    mockFetchJson({
      app_version: '0.1.0',
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
    });

    const discovery = await loadCompanionDiscovery('http://10.0.2.2:38641/');

    expect(discovery).toMatchObject({
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
    });

    mockFetchJson(
      {
        expires_at: '2026-04-22T12:02:00.000Z',
        pair_request_id: 'pair-request-1',
        status: 'pending'
      },
      202
    );

    const request = await requestCompanionPairing({
      deviceId: 'web-preview-device',
      deviceKind: 'web-preview',
      deviceName: 'Preview',
      endpointUrl: 'http://10.0.2.2:38641/'
    });

    expect(request).toEqual({
      expires_at: '2026-04-22T12:02:00.000Z',
      pair_request_id: 'pair-request-1',
      status: 'pending'
    });

    mockFetchJson({
      device_id: 'web-preview-device',
      device_secret: 'test-secret',
      paired_at: '2026-04-22T12:00:00.000Z',
      peer_id: 'desktop-local'
    });

    const state = await pairCompanionWithDesktop({
      deviceKind: 'web-preview',
      deviceName: 'Preview',
      endpointUrl: 'http://10.0.2.2:38641/',
      pairRequestId: 'pair-request-1'
    });

    expect(state).toEqual({
      device_id: 'web-preview-device',
      device_kind: 'web-preview',
      device_name: 'Preview',
      is_paired: true,
      paired_at: '2026-04-22T12:00:00.000Z'
    });
    await expect(loadCompanionPairingState()).resolves.toMatchObject({ is_paired: true });
  });

  it('verifies native pairing credentials are readable after saving', async () => {
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    mockFetchJson({
      device_id: 'android-test-device',
      device_secret: 'test-secret',
      paired_at: '2026-04-22T12:00:00.000Z',
      peer_id: 'desktop-local'
    });
    capacitorMock.plugin.savePairingCredentials.mockResolvedValue({
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Pixel 9',
      is_paired: true,
      paired_at: '2026-04-22T12:00:00.000Z'
    });
    capacitorMock.plugin.loadPairingState.mockResolvedValue({
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Pixel 9',
      is_paired: true,
      paired_at: '2026-04-22T12:00:00.000Z'
    });

    const state = await pairCompanionWithDesktop({
      deviceKind: 'android-capacitor',
      deviceName: 'Pixel 9',
      endpointUrl: 'http://10.0.2.2:38641',
      pairRequestId: 'pair-request-1'
    });

    expect(capacitorMock.plugin.savePairingCredentials).toHaveBeenCalledWith({
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Pixel 9',
      device_secret: 'test-secret',
      paired_at: '2026-04-22T12:00:00.000Z'
    });
    expect(capacitorMock.plugin.loadPairingState).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ is_paired: true, device_name: 'Pixel 9' });
  });

  it('fails native pairing when credentials cannot be read back locally', async () => {
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    mockFetchJson({
      device_id: 'android-test-device',
      device_secret: 'test-secret',
      paired_at: '2026-04-22T12:00:00.000Z',
      peer_id: 'desktop-local'
    });
    capacitorMock.plugin.savePairingCredentials.mockResolvedValue({
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null
    });
    capacitorMock.plugin.loadPairingState.mockResolvedValue({
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null
    });

    await expect(pairCompanionWithDesktop({
      deviceKind: 'android-capacitor',
      deviceName: 'Pixel 9',
      endpointUrl: 'http://10.0.2.2:38641',
      pairRequestId: 'pair-request-1'
    })).rejects.toThrow('Android pairing credentials were not saved.');
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
  registerPairingTest();
  registerEndpointPersistenceTest();
  registerSnapshotPullTest();
  registerWorkspaceVersionTest();
  registerReadableArticleTest();
  registerSnapshotPersistenceTest();
});
