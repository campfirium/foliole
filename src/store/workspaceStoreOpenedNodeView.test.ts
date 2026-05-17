import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

function createNode(id: string, title: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title,
    content: '',
    hasContent: true,
    reveal: null,
    hasReveal: false,
    review: null,
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z'
  };
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('records last-opened time when opening a node without waiting for editor view saves', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodeViewById: {},
    nodesById: {
      'node-1': createNode('node-1', 'Node 1'),
      'node-2': createNode('node-2', 'Node 2')
    },
    trashedNodeIds: []
  });

  vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
  useWorkspaceStore.getState().openNode('node-2');

  expect(useWorkspaceStore.getState().nodeViewById['node-2']).toEqual({
    scrollTop: 0,
    selection: null,
    updatedAt: '2026-04-30T12:00:00.000Z'
  });
});

it('preserves reading position when recording a later open', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeViewById: {
      'node-1': {
        scrollTop: 42,
        selection: { from: 3, to: 9 },
        updatedAt: '2026-04-29T12:00:00.000Z'
      }
    },
    nodesById: {
      'node-1': createNode('node-1', 'Node 1')
    }
  });

  vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
  useWorkspaceStore.getState().setActiveNode('node-1');

  expect(useWorkspaceStore.getState().nodeViewById['node-1']).toEqual({
    scrollTop: 42,
    selection: { from: 3, to: 9 },
    updatedAt: '2026-04-30T12:00:00.000Z'
  });
});
