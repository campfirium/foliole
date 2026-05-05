import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  pullCompanionWorkspaceSnapshot,
  loadCompanionWorkspaceVersion,
  saveCompanionWorkspaceSyncEndpoint
} from './companionWorkspaceSync';

function createStoredSyncState() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T12:00:00.000Z',
    workspace_snapshot: {
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': {
          content: 'Readable from local snapshot',
          id: 'node-1',
          kind: 'item',
          title: 'Synced article'
        },
        'node-2': {
          content: 'Fallback',
          id: 'node-2',
          kind: 'item',
          title: 'Fallback article'
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

describe('companionWorkspaceSync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores the sync endpoint in web preview mode', async () => {
    const state = await saveCompanionWorkspaceSyncEndpoint('http://10.0.2.2:38641/');

    expect(state.endpoint_url).toBe('http://10.0.2.2:38641');
    expect((await loadCompanionWorkspaceSyncState()).endpoint_url).toBe('http://10.0.2.2:38641');
  });

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

  it('resolves the readable article from the stored snapshot in web preview mode', async () => {
    window.localStorage.setItem('foliole-companion-workspace-sync-state', JSON.stringify(createStoredSyncState()));

    const article = await loadCompanionReadableArticle();

    expect(article).toEqual({
      content: 'Readable from local snapshot',
      nodeId: 'node-1',
      title: 'Synced article'
    });
  });
});
