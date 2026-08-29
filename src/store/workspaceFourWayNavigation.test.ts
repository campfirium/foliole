import { beforeEach, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import {
  resolveBackNavigationTarget,
  resolveForwardNavigationTarget,
  resolveLastChildNavigationTarget,
  resolveParentNavigationTarget
} from './workspaceNavigationTargets';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function node(id: string, parentNodeId: string | null = null): Node {
  return {
    ...createInitialWorkspaceState(new Date('2026-08-29T00:00:00.000Z')).nodesById['node-1']!,
    id,
    parentNodeId,
    title: id
  };
}

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-08-29T00:00:00.000Z')));
});

it('skips unavailable entries in both history directions', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'current',
    navigation: {
      backStack: ['back', 'missing-back'],
      forwardStack: ['missing-forward', 'forward']
    },
    nodeOrder: ['back', 'current', 'forward'],
    nodesById: { back: node('back'), current: node('current'), forward: node('forward') },
    trashedNodeIds: []
  });

  expect(resolveBackNavigationTarget(useWorkspaceStore.getState()).nodeId).toBe('back');
  useWorkspaceStore.getState().goBack();
  expect(useWorkspaceStore.getState()).toMatchObject({
    activeNodeId: 'back',
    navigation: { backStack: [], forwardStack: ['current', 'missing-forward', 'forward'] }
  });

  useWorkspaceStore.setState({
    activeNodeId: 'current',
    navigation: { backStack: [], forwardStack: ['missing-forward', 'forward'] }
  });
  expect(resolveForwardNavigationTarget(useWorkspaceStore.getState()).nodeId).toBe('forward');
  useWorkspaceStore.getState().goForward();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('forward');
  expect(useWorkspaceStore.getState().navigation.forwardStack).toEqual([]);
});

it('clears an exhausted unavailable history direction', () => {
  useWorkspaceStore.setState({ navigation: { backStack: ['missing'], forwardStack: [] } });

  expect(useWorkspaceStore.getState().goBack()).toBeNull();
  expect(useWorkspaceStore.getState().navigation.backStack).toEqual([]);
});

it('resolves the available parent and last canonical direct child without reordering', () => {
  const root = { ...node('root'), manualChildOrder: ['first', 'last'] };
  useWorkspaceStore.setState({
    activeNodeId: 'root',
    navigation: { backStack: [], forwardStack: [] },
    nodeOrder: ['root', 'last', 'grandchild', 'first'],
    nodesById: {
      first: node('first', 'root'),
      grandchild: node('grandchild', 'last'),
      last: node('last', 'root'),
      root
    },
    trashedNodeIds: []
  });
  const originalOrder = [...useWorkspaceStore.getState().nodeOrder];

  expect(resolveLastChildNavigationTarget(useWorkspaceStore.getState())).toBe('first');
  useWorkspaceStore.getState().goToLastChild();
  expect(resolveParentNavigationTarget(useWorkspaceStore.getState())).toBe('root');
  expect(useWorkspaceStore.getState().activeNodeId).toBe('first');
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(originalOrder);
  expect(useWorkspaceStore.getState().nodesById.root?.manualChildOrder).toEqual(['first', 'last']);
});

it('excludes trashed direct children from the last-child target', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'root',
    nodeOrder: ['root', 'available', 'trashed'],
    nodesById: {
      available: node('available', 'root'),
      root: node('root'),
      trashed: node('trashed', 'root')
    },
    trashedNodeIds: ['trashed']
  });

  expect(resolveLastChildNavigationTarget(useWorkspaceStore.getState())).toBe('available');
});
