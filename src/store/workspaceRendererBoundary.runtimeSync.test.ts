import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')));
}

function createLoadedNode(nodeId: string, title: string, content: string, reveal: string | null) {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1'];
  return {
    ...seedNode,
    id: nodeId,
    title,
    content,
    hasContent: content.trim().length > 0,
    reveal,
    hasReveal: reveal !== null
  };
}

describe('workspace renderer boundary runtime confirmation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(getRuntimeInvoke).mockReset();
    resetWorkspaceStore();
  });

  it('drops inactive node documents after runtime confirmation clears the pending edit', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(null));

    useWorkspaceStore.setState({
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': createLoadedNode('node-1', 'Node 1', '', null),
        'node-2': createLoadedNode('node-2', 'Node 2', 'Active node body', 'Active node answer')
      },
      trashedNodeIds: []
    });

    useWorkspaceStore.getState().updateNodeContent('node-1', 'Locally edited body');

    expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
      content: 'Locally edited body',
      hasContent: true,
      reveal: null,
      hasReveal: false
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
      content: '',
      hasContent: true,
      reveal: null,
      hasReveal: false
    });
    expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
      content: 'Active node body',
      hasContent: true,
      reveal: 'Active node answer',
      hasReveal: true
    });
  });
});
