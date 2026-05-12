import { describe, expect, it } from 'vitest';

import { filterTrashRootIdsByTitle, resolveTrashRootId, selectTrashRootIds } from './trashRootModel';
import type { WorkspaceListNode } from './workspaceListNode';

function createNode(id: string, title: string, parentNodeId: string | null = null): WorkspaceListNode {
  return {
    createdAt: '2026-05-01T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    parentNodeId,
    kind: 'topic',
    review: null,
    title,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

describe('trash root model', () => {
  const nodesById = {
    folder: createNode('folder', 'Folder'),
    topic: createNode('topic', 'Topic', 'folder'),
    item: createNode('item', 'Needle item', 'topic'),
    solo: createNode('solo', 'Solo item', 'folder')
  };
  const nodeOrder = ['folder', 'topic', 'item', 'solo'];

  it('selects only deleted roots when a deleted parent covers its subtree', () => {
    expect(selectTrashRootIds(nodeOrder, nodesById, ['folder', 'topic', 'item', 'solo'])).toEqual(['folder']);
    expect(selectTrashRootIds(nodeOrder, nodesById, ['topic', 'item', 'solo'])).toEqual(['topic', 'solo']);
  });

  it('resolves non-root deleted nodes to the highest deleted ancestor', () => {
    expect(resolveTrashRootId('item', nodesById, ['folder', 'topic', 'item'])).toBe('folder');
    expect(resolveTrashRootId('item', nodesById, ['topic', 'item'])).toBe('topic');
    expect(resolveTrashRootId('item', nodesById, ['item'])).toBe('item');
  });

  it('matches subtree titles while returning root ids', () => {
    expect(filterTrashRootIdsByTitle(['folder'], nodeOrder, nodesById, ['folder', 'topic', 'item'], 'needle')).toEqual(['folder']);
  });
});
