import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { resolvePendingNodeSync, stagePendingNodeSync } from '../shared/platform/workspacePendingNodeSync';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function createLoadedNode(id: string, values: Partial<Node> = {}): Node {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;
  return {
    ...seedNode,
    id,
    title: id,
    content: `${id} body`,
    hasContent: true,
    reveal: `${id} answer`,
    hasReveal: true,
    ...values
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(getRuntimeInvoke).mockReset();
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-06-19T00:00:00.000Z')));
});

it('keeps inline documents when no runtime repository can reload them', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': createLoadedNode('node-1'),
      'node-2': createLoadedNode('node-2')
    },
    trashedNodeIds: []
  });

  const state = useWorkspaceStore.getState();
  expect(state.nodesById['node-1']!).toMatchObject({
    content: 'node-1 body',
    reveal: 'node-1 answer'
  });
  expect(state.nodesById['node-2']!).toMatchObject({
    content: 'node-2 body',
    reveal: 'node-2 answer'
  });
});

it('does not trim resolved pending node sync content without a reloadable runtime', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': createLoadedNode('node-1', { updatedAt: '2026-06-19T00:00:00.000Z' }),
      'node-2': createLoadedNode('node-2')
    },
    trashedNodeIds: []
  });

  stagePendingNodeSync({
    nodeId: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'node-1',
    isTitleManual: true,
    content: 'pending body',
    reveal: 'pending answer',
    anchorLink: null,
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:01:00.000Z'
  });
  resolvePendingNodeSync('node-1', '2026-06-19T00:01:00.000Z');

  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({
    content: 'node-1 body',
    reveal: 'node-1 answer'
  });
});
