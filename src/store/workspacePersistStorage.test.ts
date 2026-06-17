import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HOME_NODE_ID } from '../features/nodes/model/specialNodes';
import { appendReadingPositionTraceLog } from '../shared/platform/readingPositionTraceRuntimeRepository';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { workspacePersistStorage } from './workspacePersistStorage';
import {
  readWorkspaceNodesFromPayload,
  stageLegacyWorkspacePayload,
  stagePendingNode1Sync
} from './workspacePersistStorage.test-support';

vi.mock('../shared/platform/readingPositionTraceRuntimeRepository', () => ({
  appendReadingPositionTraceLog: vi.fn()
}));

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(appendReadingPositionTraceLog).mockReset();
  vi.mocked(getRuntimeInvoke).mockReset();
  window.localStorage.clear();
});

function createSnapshotInvoke(
  readingProgress: unknown,
  snapshot: unknown = {
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
      'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reveal: null }
    },
    trashedNodeIds: ['node-1']
  },
  activeDocument: unknown = {
    nodeId: 'node-2',
    content: 'Node 2 content',
    hideTitleHeading: false,
    reveal: null
  }
) {
  return vi.fn().mockImplementation((command: string) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve(snapshot);
    }
    if (command === 'load_node_document') {
      return Promise.resolve(activeDocument);
    }
    return Promise.resolve(readingProgress);
  });
}

function createPendingDismissedNodeSync() {
  return {
    nodesById: {
      'node-2': {
        nodeId: 'node-2',
        parentNodeId: null,
        priority: 0,
        desiredRetention: null,
        title: 'Node 2',
        isTitleManual: false,
        content: 'Node 2 content',
        reveal: null,
        anchorLink: null,
        reading: {
          intervalDurationMs: 0,
          intervalGrowthFactor: 1,
          lastHandledAt: '2026-03-18T00:00:00.000Z',
          nextAt: '2026-03-18T00:00:00.000Z',
          priority: 5,
          readingPosition: 0,
          repetitionCount: 0,
          state: 'dismissed'
        },
        position: 1,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z'
      }
    }
  };
}

function readPersistedState(value: string | null) {
  return value ? (JSON.parse(value) as { state: { nodeViewById?: Record<string, unknown>; nodesById?: Record<string, unknown>; activeNodeId?: string | null } }).state : null;
}

function createRuntimeSnapshotWithoutReading() {
  return {
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reading: null, review: null, reveal: null },
      'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reading: null, review: null, reveal: null }
    },
    trashedNodeIds: []
  };
}

describe('workspacePersistStorage runtime merge', () => {
  it('overlays pending node snapshot mutations during hydrate before replay finishes', async () => {
    window.localStorage.setItem('foliole-pending-node-sync-v1', JSON.stringify(createPendingDismissedNodeSync()));
    const invoke = createSnapshotInvoke({ activeNodeId: 'node-2', nodeViewStateById: {} }, createRuntimeSnapshotWithoutReading());
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toContain('"state":"dismissed"');
    expect(invoke).toHaveBeenCalledWith('update_node_content', expect.objectContaining({
      nodeId: 'node-2',
      reading: expect.objectContaining({ state: 'dismissed' })
    }));
  });

  it('merges node view and active node from reading progress', async () => {
    const invoke = createSnapshotInvoke({
      activeNodeId: 'node-2',
      nodeViewStateById: {
        'node-2': {
          scrollTop: 18,
          selectionFrom: 5,
          selectionTo: 7
        }
      }
    });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');
    const state = readPersistedState(value);

    expect(value).toContain('"node-1":{"id":"node-1","content":"","hasContent":true');
    expect(value).toContain('"node-2":{"id":"node-2","content":"Node 2 content"');
    expect(state?.nodeViewById).toEqual({
      'node-2': {
        scrollTop: 18,
        selection: { from: 5, to: 7 },
        updatedAt: null
      }
    });
    expect(invoke).toHaveBeenCalledWith('load_workspace_list_snapshot', { includePdfOpenings: false });
    expect(invoke).toHaveBeenCalledWith('load_reading_progress');
    expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-2' });
  });

});

describe('workspacePersistStorage runtime fallback', () => {
  it('returns null when sqlite snapshot is empty', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    window.localStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-3"}}');

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toBeNull();
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBe('{"state":{"activeNodeId":"node-3"}}');
    expect(invoke).toHaveBeenCalledWith('load_workspace_list_snapshot', { includePdfOpenings: false });
  });

  it('falls back to the Home node when reading progress active node is invalid', async () => {
    const invoke = createSnapshotInvoke(
      {
        activeNodeId: 'missing-node',
        nodeViewStateById: {}
      },
      {
        activeNodeId: 'node-2',
        nodeOrder: ['node-1', 'node-2'],
        nodesById: {
          'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
          'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reveal: null }
        },
        trashedNodeIds: []
      }
    );
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toContain(`"activeNodeId":"${HOME_NODE_ID}"`);
    expect(value).toContain(`"${HOME_NODE_ID}":{"id":"${HOME_NODE_ID}"`);
    expect(value).toContain('"content":"Node 2 content"');
  });
});

describe('workspacePersistStorage runtime logging', () => {
  it('logs degraded hydrate when reading progress load fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invoke = vi.fn().mockImplementation((command: string) => {
      if (command === 'load_workspace_list_snapshot') {
        return Promise.resolve({
          activeNodeId: 'node-2',
          nodeOrder: ['node-1', 'node-2'],
          nodesById: {
            'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
            'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reveal: null }
          },
          trashedNodeIds: []
        });
      }
      return Promise.reject(new Error('sqlite busy'));
    });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toContain('"activeNodeId":"node-2"');
    expect(warn).toHaveBeenCalledWith(
      '[persistence] reading progress load failed during workspace hydrate',
      expect.objectContaining({
        area: 'persistence',
        action: 'hydrate_workspace_state',
        fallback: 'merge_snapshot_without_reading_progress',
        storageKey: 'foliole-workspace-v1',
        error: { name: 'Error', message: 'sqlite busy' }
      })
    );
  });
});

describe('workspacePersistStorage web fallback', () => {
  it('saves and clears persisted payload through localStorage in web mode only', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    await workspacePersistStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-3"}}');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBe('{"state":{"activeNodeId":"node-3"}}');

    await workspacePersistStorage.removeItem('foliole-workspace-v1');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBeNull();
  });

  it('does not write workspace payload into localStorage in desktop mode', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn());

    await workspacePersistStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-4"}}');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBeNull();
  });
});

describe('workspacePersistStorage web fallback renderer boundary', () => {
  it('keeps full persisted node documents because localStorage is the web fallback database', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
    stagePendingNode1Sync();
    stageLegacyWorkspacePayload();

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');
    const nodesById = readWorkspaceNodesFromPayload(value);

    expect(nodesById?.['node-1']).toEqual({
      id: 'node-1',
      content: 'Pending node 1 body',
      hasContent: true,
      hasReveal: false,
      reveal: null
    });
    expect(nodesById?.['node-2']).toEqual({
      id: 'node-2',
      content: 'Active node 2 body',
      hasContent: true,
      hasReveal: true,
      reveal: 'Active node 2 answer'
    });
    expect(nodesById?.['node-3']).toEqual({
      id: 'node-3',
      content: 'Unexpected node 3 body',
      hasContent: true,
      hasReveal: true,
      reveal: 'Unexpected node 3 answer'
    });
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBe(value);
  });
});
