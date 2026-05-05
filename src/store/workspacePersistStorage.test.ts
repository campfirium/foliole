import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/bridge';

import { workspacePersistStorage } from './workspacePersistStorage';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
  window.localStorage.clear();
});

function createSnapshotInvoke(
  readingProgress: unknown,
  snapshot: unknown = {
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { id: 'node-1' },
      'node-2': { id: 'node-2' }
    },
    trashedNodeIds: ['node-1']
  }
) {
  return vi.fn().mockImplementation((command: string) => {
    if (command === 'load_workspace_snapshot') {
      return Promise.resolve(snapshot);
    }
    return Promise.resolve(readingProgress);
  });
}

describe('workspacePersistStorage runtime merge', () => {
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

    expect(value).toBe(
      '{"state":{"activeNodeId":"node-2","nodeOrder":["node-1","node-2"],"nodesById":{"node-1":{"id":"node-1"},"node-2":{"id":"node-2"}},"trashedNodeIds":["node-1"],"nodeViewById":{"node-2":{"scrollTop":18,"selection":{"from":5,"to":7}}}},"version":0}'
    );
    expect(invoke).toHaveBeenCalledWith('load_workspace_snapshot');
    expect(invoke).toHaveBeenCalledWith('load_reading_progress');
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
    expect(invoke).toHaveBeenCalledWith('load_workspace_snapshot');
  });

  it('keeps workspace snapshot active node when reading progress active node is invalid', async () => {
    const invoke = createSnapshotInvoke(
      {
        activeNodeId: 'missing-node',
        nodeViewStateById: {}
      },
      {
        activeNodeId: 'node-2',
        nodeOrder: ['node-1', 'node-2'],
        nodesById: {
          'node-1': { id: 'node-1' },
          'node-2': { id: 'node-2' }
        },
        trashedNodeIds: []
      }
    );
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toBe(
      '{"state":{"activeNodeId":"node-2","nodeOrder":["node-1","node-2"],"nodesById":{"node-1":{"id":"node-1"},"node-2":{"id":"node-2"}},"trashedNodeIds":[],"nodeViewById":{}},"version":0}'
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
