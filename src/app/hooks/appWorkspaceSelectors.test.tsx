import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceSelectors } from './appWorkspaceSelectors';

function createNode(id: string, patch: Partial<Node> = {}): Node {
  return {
    content: '',
    createdAt: '2026-05-24T00:00:00.000Z',
    hasContent: false,
    hideTitleHeading: false,
    id,
    isTitleManual: true,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-05-24T00:00:00.000Z',
    ...patch
  };
}

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-05-24T00:00:00.000Z')));
});

it('exposes canonical visible and trash membership to desktop consumers', () => {
  useWorkspaceStore.setState({
    nodeOrder: ['visible-1', 'deleted-1', 'restored-1'],
    nodesById: {
      'deleted-1': createNode('deleted-1', { deletedAt: '2026-05-24T00:01:00.000Z' }),
      'restored-1': createNode('restored-1', { deletedAt: null }),
      'visible-1': createNode('visible-1')
    },
    trashedNodeDeletedAtById: {
      'restored-1': '2026-05-24T00:02:00.000Z'
    },
    trashedNodeIds: ['restored-1']
  });

  const { result } = renderHook(() => useWorkspaceSelectors());

  expect(result.current.nodeOrder).toEqual(['visible-1', 'restored-1']);
  expect(result.current.trashedNodeIds).toEqual(['deleted-1']);
});
