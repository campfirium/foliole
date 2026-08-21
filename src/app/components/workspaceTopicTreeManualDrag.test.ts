import { expect, it, vi } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  createWorkspaceTopicTreeMove,
  moveWorkspaceTopicTreeManualNodeIds
} from './workspaceTopicTreeManualDrag';

function node(id: string, parentNodeId: string | null): WorkspaceListNode {
  return {
    anchorLink: null,
    createdAt: '',
    hasContent: true,
    hasReveal: false,
    id,
    kind: id.startsWith('folder-') ? 'folder' : 'topic',
    parentNodeId,
    review: null,
    title: id,
    updatedAt: ''
  };
}

const nodesById = {
  'folder-a': node('folder-a', null),
  'topic-a': node('topic-a', 'folder-a'),
  'topic-b': node('topic-b', 'folder-a')
} satisfies WorkspaceListNodesById;

it('keeps derived topics available as manual before and after anchors', () => {
  expect(moveWorkspaceTopicTreeManualNodeIds({
    currentOrder: ['topic-derived', 'topic-b', 'topic-a'],
    intent: 'after',
    sourceNodeIds: ['topic-a'],
    targetNodeId: 'topic-derived'
  })).toEqual(['topic-derived', 'topic-a', 'topic-b']);
});

it('routes structural drops without a modifier gate', async () => {
  const moveNodes = vi.fn(async () => true);
  const move = createWorkspaceTopicTreeMove({
    activeFolderId: 'folder-a',
    currentOrder: ['topic-a', 'topic-b'],
    isManualSort: false,
    moveNodes,
    nodesById
  });

  await expect(move(['topic-a'], 'topic-b', 'child')).resolves.toBe(true);
  expect(moveNodes).toHaveBeenCalledWith(['topic-a'], 'topic-b', 'child');
});

it('writes only manual order for Manual top-level edges', async () => {
  const moveNodes = vi.fn(async () => true);
  const setFolderManualChildOrder = vi.fn(() => true);
  const move = createWorkspaceTopicTreeMove({
    activeFolderId: 'folder-a',
    currentOrder: ['topic-a', 'topic-b'],
    isManualSort: true,
    moveNodes,
    nodesById,
    setFolderManualChildOrder
  });

  await expect(move(['topic-b'], 'topic-a', 'before')).resolves.toBe(true);
  expect(setFolderManualChildOrder).toHaveBeenCalledWith('folder-a', ['topic-b', 'topic-a']);
  expect(moveNodes).not.toHaveBeenCalled();
});
