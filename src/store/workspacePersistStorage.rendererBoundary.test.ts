import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/bridge';

import { workspacePersistStorage } from './workspacePersistStorage';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createRuntimeInvoke() {
  return vi.fn().mockImplementation((command: string) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve({
        activeNodeId: 'node-2',
        nodeOrder: ['node-1', 'node-2', 'node-3'],
        nodesById: {
          'node-1': {
            id: 'node-1',
            content: 'Unexpected node 1 body',
            hasContent: true,
            hasReveal: false,
            reveal: null
          },
          'node-2': {
            id: 'node-2',
            content: '',
            hasContent: true,
            hasReveal: true,
            reveal: null
          },
          'node-3': {
            id: 'node-3',
            content: 'Unexpected node 3 body',
            hasContent: true,
            hasReveal: true,
            reveal: 'Unexpected node 3 answer'
          }
        },
        trashedNodeIds: []
      });
    }
    if (command === 'load_node_document') {
      return Promise.resolve({
        nodeId: 'node-2',
        content: 'Node 2 content',
        hideTitleHeading: false,
        reveal: 'Node 2 answer'
      });
    }
    return Promise.resolve({ activeNodeId: 'node-2', nodeViewStateById: {} });
  });
}

function stagePendingNodeDocument() {
  window.localStorage.setItem(
    'foliole-pending-node-sync-v1',
    JSON.stringify({
      nodesById: {
        'node-1': {
          nodeId: 'node-1',
          parentNodeId: null,
          priority: null,
          desiredRetention: null,
          title: 'Node 1',
          isTitleManual: false,
          hideTitleHeading: false,
          content: 'Pending node 1 draft',
          reveal: null,
          anchorLink: null,
          reading: null,
          position: 0,
          createdAt: '2026-03-06T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z'
        }
      }
    })
  );
}

function readHydratedState(value: string | null) {
  return value ? (JSON.parse(value) as { state: { activeNodeId: string; nodesById: Record<string, { content: string; reveal: string | null }> } }).state : null;
}

describe('workspacePersistStorage renderer boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getRuntimeInvoke).mockReset();
    window.localStorage.clear();
  });

  it('keeps only active and pending node documents in the hydrate payload', async () => {
    stagePendingNodeDocument();
    vi.mocked(getRuntimeInvoke).mockReturnValue(createRuntimeInvoke());

    const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

    expect(state?.activeNodeId).toBe('node-2');
    expect(state?.nodesById['node-1']).toMatchObject({
      content: 'Pending node 1 draft',
      reveal: null
    });
    expect(state?.nodesById['node-2']).toMatchObject({
      content: 'Node 2 content',
      reveal: 'Node 2 answer'
    });
    expect(state?.nodesById['node-3']).toMatchObject({
      content: '',
      reveal: null
    });
  });
});
