import { expect, it, vi } from 'vitest';

import {
  createWorkspaceTopicTreeManualMove,
  moveWorkspaceTopicTreeManualNodeIds
} from './workspaceTopicTreeManualDrag';

it('keeps derived topics available as manual before and after anchors', () => {
  expect(moveWorkspaceTopicTreeManualNodeIds({
    currentOrder: ['topic-derived', 'topic-b', 'topic-a'],
    intent: 'after',
    sourceNodeIds: ['topic-a'],
    targetNodeId: 'topic-derived'
  })).toEqual(['topic-derived', 'topic-a', 'topic-b']);
});

it('routes Alt structural drops to structural movement', async () => {
  const moveNodes = vi.fn(async () => true);
  const move = createWorkspaceTopicTreeManualMove({
    activeFolderId: 'folder-a',
    currentOrder: ['topic-a', 'topic-b'],
    derivedNodeIds: new Set(),
    isManualSort: false,
    moveNodes,
    parentNodeIdById: { 'folder-a': null, 'topic-a': 'folder-a', 'topic-b': 'folder-a' },
    shouldAllowStructuralMove: () => true
  });

  await expect(move(['topic-a'], 'topic-b', 'child')).resolves.toBe(true);
  expect(moveNodes).toHaveBeenCalledWith(['topic-a'], 'topic-b', 'child');
});
