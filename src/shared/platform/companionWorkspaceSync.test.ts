import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    loadReadableArticle: vi.fn(),
    loadWorkspaceSyncState: vi.fn(),
    replaceWorkspaceNode: vi.fn(),
    replaceWorkspaceSnapshot: vi.fn(),
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
  persistCompanionWorkspaceSnapshot,
  pullCompanionWorkspaceSnapshot,
  loadCompanionWorkspaceVersion,
  saveCompanionWorkspaceSyncEndpoint
} from './companionWorkspaceSync';

function createStoredSyncState(): NativeCompanionWorkspaceSyncState {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T12:00:00.000Z',
    workspace_snapshot: {
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': {
          content: 'Readable from local snapshot',
          createdAt: '2026-04-22T11:00:00.000Z',
          id: 'node-1',
          isTitleManual: false,
          hideTitleHeading: false,
          kind: 'item',
          parentNodeId: null,
          reading: null,
          reveal: null,
          review: null,
          title: 'Synced article',
          updatedAt: '2026-04-22T11:30:00.000Z',
          anchorLink: null
        },
        'node-2': {
          content: 'Fallback',
          createdAt: '2026-04-22T10:00:00.000Z',
          id: 'node-2',
          isTitleManual: false,
          hideTitleHeading: false,
          kind: 'item',
          parentNodeId: null,
          reading: null,
          reveal: null,
          review: null,
          title: 'Fallback article',
          updatedAt: '2026-04-22T10:30:00.000Z',
          anchorLink: null
        }
      },
      trashedNodeIds: [],
      untitledSequenceByParent: {}
    }
  };
}

function mockFetchJson(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
  );
}

function createUpdatedStoredSnapshot() {
  const storedState = createStoredSyncState();
  const baseSnapshot = storedState.workspace_snapshot;
  if (!baseSnapshot) {
    throw new Error('Expected stored snapshot to exist.');
  }
  return {
    endpointUrl: storedState.endpoint_url,
    lastSyncedAt: storedState.last_synced_at,
    workspaceSnapshot: {
      ...baseSnapshot,
      nodesById: {
        ...baseSnapshot.nodesById,
        'node-1': {
          ...baseSnapshot.nodesById['node-1'],
          review: {
            difficulty: 4.1,
            due: '2026-04-25T12:00:00.000Z',
            elapsedDays: 0,
            lapses: 0,
            lastReviewAt: '2026-04-22T12:30:00.000Z',
            reps: 2,
            scheduledDays: 3,
            stability: 3.2,
            state: 2 as const
          },
          updatedAt: '2026-04-22T12:30:00.000Z'
        }
      }
    }
  };
}

function resetCompanionWorkspaceSyncTestState() {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  capacitorMock.getPlatform.mockReturnValue('web');
  capacitorMock.isNativePlatform.mockReturnValue(false);
}

function registerEndpointPersistenceTest() {
  it('stores the sync endpoint in web preview mode', async () => {
    const state = await saveCompanionWorkspaceSyncEndpoint('http://10.0.2.2:38641/');

    expect(state.endpoint_url).toBe('http://10.0.2.2:38641');
    expect((await loadCompanionWorkspaceSyncState()).endpoint_url).toBe('http://10.0.2.2:38641');
  });
}

function registerSnapshotPullTest() {
  it('pulls the desktop workspace snapshot and persists it in web preview mode', async () => {
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
    expect(state.workspace_snapshot?.activeNodeId).toBe('node-1');
  });
}

function registerWorkspaceVersionTest() {
  it('loads the lightweight workspace version payload', async () => {
    mockFetchJson({
      app_version: '0.1.0',
      exported_at: '2026-04-22T12:00:00.000Z',
      has_snapshot: true,
      peer_id: 'desktop-local'
    });

    const payload = await loadCompanionWorkspaceVersion('http://10.0.2.2:38641');

    expect(payload).toMatchObject({
      exported_at: '2026-04-22T12:00:00.000Z',
      has_snapshot: true,
      peer_id: 'desktop-local'
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
      workspace_snapshot: updatedSnapshot.workspaceSnapshot
    });

    await persistCompanionWorkspaceSnapshot({
      ...updatedSnapshot,
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
  beforeEach(resetCompanionWorkspaceSyncTestState);
  registerEndpointPersistenceTest();
  registerSnapshotPullTest();
  registerWorkspaceVersionTest();
  registerReadableArticleTest();
  registerSnapshotPersistenceTest();
});
