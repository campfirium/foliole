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

  it('uses lifecycle facts over stale legacy trash membership', () => {
    const restored = { ...createNode('restored', 'Restored'), deletedAt: null };
    const deleted = { ...createNode('deleted', 'Deleted'), deletedAt: '2026-05-24T00:00:00.000Z' };
    const source = { deleted, restored };

    expect(selectTrashRootIds(['restored', 'deleted'], source, ['restored'])).toEqual(['deleted']);
    expect(resolveTrashRootId('restored', source, ['restored'])).toBeNull();
  });

  it('selects deleted roots after workspace normalization removes them from node order', () => {
    const deletedRoot = { ...createNode('deleted-root', 'Deleted root'), deletedAt: '2026-05-24T00:00:00.000Z' };
    const deletedChild = { ...createNode('deleted-child', 'Deleted child', 'deleted-root'), deletedAt: '2026-05-24T00:00:00.000Z' };
    const visible = createNode('visible', 'Visible');
    const source = { 'deleted-child': deletedChild, 'deleted-root': deletedRoot, visible };

    expect(selectTrashRootIds(['visible'], source, ['deleted-root', 'deleted-child'])).toEqual(['deleted-root']);
    expect(filterTrashRootIdsByTitle(['deleted-root'], ['visible'], source, ['deleted-root', 'deleted-child'], 'child')).toEqual(['deleted-root']);
  });

  it('resolves non-root deleted nodes to the highest deleted ancestor', () => {
    expect(resolveTrashRootId('item', nodesById, ['folder', 'topic', 'item'])).toBe('folder');
    expect(resolveTrashRootId('item', nodesById, ['topic', 'item'])).toBe('topic');
    expect(resolveTrashRootId('item', nodesById, ['item'])).toBe('item');
  });

  it('matches subtree titles while returning root ids', () => {
    expect(filterTrashRootIdsByTitle(['folder'], nodeOrder, nodesById, ['folder', 'topic', 'item'], 'needle')).toEqual(['folder']);
  });

  it('keeps root selection stable for large covered trash subtrees', () => {
    const manyNodesById: Record<string, WorkspaceListNode> = {
      root: createNode('root', 'Root'),
      solo: createNode('solo', 'Solo')
    };
    const manyNodeOrder = ['root'];
    const manyTrashedNodeIds = ['root'];
    let parentNodeId = 'root';
    for (let index = 0; index < 1000; index += 1) {
      const nodeId = `child-${index}`;
      manyNodesById[nodeId] = createNode(nodeId, `Child ${index}`, parentNodeId);
      manyNodeOrder.push(nodeId);
      manyTrashedNodeIds.push(nodeId);
      parentNodeId = nodeId;
    }
    manyNodeOrder.push('solo');
    manyTrashedNodeIds.push('solo');

    expect(selectTrashRootIds(manyNodeOrder, manyNodesById, manyTrashedNodeIds)).toEqual(['root', 'solo']);
  }, 15000);

  it('matches deep covered descendants without changing root order', () => {
    expect(filterTrashRootIdsByTitle(['folder', 'solo'], nodeOrder, nodesById, ['folder', 'topic', 'item', 'solo'], 'needle')).toEqual(['folder']);
  });
});
