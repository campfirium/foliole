import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    clearAppData: vi.fn(),
    loadPairingState: vi.fn(),
    loadDiscoveryCandidates: vi.fn(),
    loadReadableArticle: vi.fn(),
    loadWorkspaceSyncState: vi.fn(),
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

import { clearCompanionAppData } from './companionAppData';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  loadCompanionWorkspaceVersion,
  persistCompanionWorkspaceSnapshot,
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

  it('clears app data state in web preview mode', async () => {
    window.localStorage.setItem('foliole-companion-workspace-sync-state', JSON.stringify(createStoredSyncState()));

    const state = await clearCompanionAppData();

    expect(state).toMatchObject({
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_onboarding_status: 'pending',
      workspace_snapshot: null
    });
  });

  it('routes app data clearing through the native Android plugin', async () => {
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.plugin.clearAppData.mockResolvedValue({
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'pending',
      workspace_snapshot: null
    });

    await clearCompanionAppData();

    expect(capacitorMock.plugin.clearAppData).toHaveBeenCalledWith();
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
      bodyBlobHash: null,
      bodyStatus: 'ready',
      content: 'Readable from local snapshot',
      contentPaddingTop: 'calc(var(--editor-space-xs) + var(--editor-space-md) + 2.485em + var(--editor-space-xs))',
      hideTitleHeading: false,
      nodeId: 'node-1',
      persistedNodeViewState: null,
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Synced article'
    });
  });

  it('uses the provided snapshot on native Android so title-slot context stays available', async () => {
    const state = createStoredSyncState();
    const snapshot = state.workspace_snapshot;
    if (!snapshot) throw new Error('Expected stored snapshot to exist.');
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    snapshot.nodesById['node-1'] = {
      ...snapshot.nodesById['node-1']!,
      content: 'Body only',
      kind: 'topic'
    };

    const article = await loadCompanionReadableArticle(snapshot);

    expect(capacitorMock.plugin.loadReadableArticle).not.toHaveBeenCalled();
    expect(article?.contentPaddingTop).toBe('calc(var(--editor-space-xs) + var(--editor-space-md) + 2.485em + var(--editor-space-xs))');
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

  it('refreshes native companion state without snapshot replacement bridge calls', async () => {
    const updatedSnapshot = createUpdatedStoredSnapshot();
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.plugin.loadWorkspaceSyncState.mockResolvedValue({
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

    expect(capacitorMock.plugin.loadWorkspaceSyncState).toHaveBeenCalled();
  });
}

describe('companionWorkspaceSync', () => {
  beforeEach(() => resetCompanionWorkspaceSyncTestState(capacitorMock));
  registerEndpointPersistenceTest();
  registerWorkspaceVersionTest();
  registerReadableArticleTest();
  registerSnapshotPersistenceTest();
});
