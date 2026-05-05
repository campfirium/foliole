import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/bridge';

import { workspacePersistStorage } from './workspacePersistStorage';
import { readWorkspaceNodesFromPayload } from './workspacePersistStorage.test-support';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createRuntimeInvoke() {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve({
        activeNodeId: 'node-2',
        nodeOrder: ['node-1', 'node-2', 'node-3'],
        nodesById: {
          'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
          'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: true, reveal: null },
          'node-3': { id: 'node-3', content: '', hasContent: true, hasReveal: true, reveal: null }
        },
        trashedNodeIds: []
      });
    }
    if (command === 'load_node_document') {
      if (payload?.nodeId !== 'node-2') {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        nodeId: 'node-2',
        content: 'Loaded node 2 body',
        hideTitleHeading: false,
        reveal: 'Loaded node 2 answer'
      });
    }
    return Promise.resolve({ activeNodeId: 'node-2', nodeViewStateById: {} });
  });
}

describe('workspacePersistStorage on-demand document hydrate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getRuntimeInvoke).mockReset();
    window.localStorage.clear();
  });

  it('loads only the active node document from runtime hydrate', async () => {
    const invoke = createRuntimeInvoke();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');
    const nodesById = readWorkspaceNodesFromPayload(value);
    const loadDocumentCalls = invoke.mock.calls.filter(([command]) => command === 'load_node_document');

    expect(loadDocumentCalls).toEqual([['load_node_document', { nodeId: 'node-2' }]]);
    expect(nodesById?.['node-1']).toEqual({
      id: 'node-1',
      content: '',
      hasContent: true,
      hasReveal: false,
      reveal: null
    });
    expect(nodesById?.['node-2']).toEqual({
      id: 'node-2',
      content: 'Loaded node 2 body',
      hasContent: true,
      hasReveal: true,
      hideTitleHeading: false,
      reveal: 'Loaded node 2 answer'
    });
    expect(nodesById?.['node-3']).toEqual({
      id: 'node-3',
      content: '',
      hasContent: true,
      hasReveal: true,
      reveal: null
    });
  });
});
