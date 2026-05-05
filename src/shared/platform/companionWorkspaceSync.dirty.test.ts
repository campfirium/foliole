import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    loadPairingState: vi.fn(),
    loadDirtyNodes: vi.fn(),
    loadReadableArticle: vi.fn(),
    loadWorkspaceSyncState: vi.fn(),
    replaceWorkspaceNode: vi.fn(),
    replaceWorkspaceSnapshot: vi.fn(),
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

import { loadCompanionDirtyNodes } from './companionWorkspaceSync';

function createStoredSyncState() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T12:00:00.000Z',
    remembered_targets: ['http://10.0.2.2:38641'],
    workspace_snapshot: {
      activeNodeId: 'node-1',
      nodeOrder: ['node-1'],
      nodesById: {
        'node-1': {
          anchorLink: null,
          content: 'Readable from local snapshot',
          createdAt: '2026-04-22T11:00:00.000Z',
          hideTitleHeading: false,
          id: 'node-1',
          isTitleManual: false,
          kind: 'item',
          parentNodeId: null,
          reading: null,
          reveal: null,
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
          title: 'Synced article',
          updatedAt: '2026-04-22T12:30:00.000Z'
        }
      },
      trashedNodeIds: [],
      untitledSequenceByParent: {}
    }
  };
}

function resetTestState() {
  window.localStorage.clear();
  vi.clearAllMocks();
  capacitorMock.getPlatform.mockReturnValue('web');
  capacitorMock.isNativePlatform.mockReturnValue(false);
}

describe('companionWorkspaceSync dirty export', () => {
  beforeEach(resetTestState);

  it('returns an empty dirty payload in web preview mode', async () => {
    window.localStorage.setItem('foliole-companion-workspace-sync-state', JSON.stringify(createStoredSyncState()));

    const payload = await loadCompanionDirtyNodes();

    expect(payload).toEqual({
      device_id: 'web-preview',
      last_synced_at: '2026-04-22T12:00:00.000Z',
      nodes: []
    });
  });

  it('loads native dirty node payloads through the companion bridge', async () => {
    const stored = createStoredSyncState();
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.plugin.loadDirtyNodes.mockResolvedValue({
      device_id: 'android-test-device',
      last_synced_at: stored.last_synced_at,
      nodes: [
        {
          device_id: 'android-test-device',
          object_id: 'node-1',
          object_type: 'node',
          updated_at: '2026-04-22T12:30:00.000Z',
          snapshot: stored.workspace_snapshot.nodesById['node-1']
        }
      ]
    });

    const payload = await loadCompanionDirtyNodes();

    expect(payload.nodes).toHaveLength(1);
    expect(payload.nodes[0]).toMatchObject({
      device_id: 'android-test-device',
      object_id: 'node-1',
      object_type: 'node',
      updated_at: '2026-04-22T12:30:00.000Z'
    });
  });
});
