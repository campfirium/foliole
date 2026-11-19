import { expect, it } from 'vitest';

import { HOME_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';

import { buildWorkspaceDualListStructureData } from './workspaceDualListStructure';
import { deriveFolderContentCounts } from './workspaceFolderContentCounts';
import { buildWorkspaceListChildrenIndex } from './workspaceListChildrenIndex';

function node(id: string, kind: 'folder' | 'topic' | 'item', parentNodeId: string | null): WorkspaceListNode {
  return {
    id, kind, parentNodeId, title: id, hasContent: kind !== 'folder', hasReveal: kind === 'item',
    createdAt: '', updatedAt: '', review: null
  };
}

it('counts deep, disconnected and cyclic visible branches once per ID', () => {
  const depth = 15_000;
  const chain = Array.from({ length: depth }, (_, i) =>
    node(`chain-${i}`, 'topic', i === 0 ? 'a' : `chain-${i - 1}`));
  const nodes = [
    node(HOME_NODE_ID, 'folder', null),
    node('a', 'folder', 'b'), node('b', 'folder', 'a'),
    node('self', 'folder', 'self'), node('self-leaf', 'item', 'self'),
    node('orphan', 'item', 'missing'), node('deleted', 'topic', 'a'),
    ...chain
  ];
  const listNodesById = Object.fromEntries(
    [...nodes, node('unordered', 'item', 'a')].map(value => [value.id, value]));
  const { folderCounts } = buildWorkspaceDualListStructureData({
    listNodesById, nodeOrder: [...nodes.map(value => value.id), 'chain-0', 'self-leaf'],
    trashedNodeIds: ['deleted']
  });
  expect([...folderCounts.byFolderId]).toEqual(expect.arrayContaining([
    [HOME_NODE_ID, depth + 2], ['a', depth], ['b', depth], ['self', 1]
  ]));
});

it('uses the moved subtree subtotal, preserving both previous row values and shared ancestry', () => {
  const nodesById = {
    common: node('common', 'folder', null),
    from: node('from', 'folder', 'common'),
    to: node('to', 'folder', 'common'),
    branch: node('branch', 'topic', 'from'),
    excerpt: node('excerpt', 'topic', 'branch'),
    item: node('item', 'item', 'excerpt')
  };
  const order = Object.keys(nodesById);
  const index = buildWorkspaceListChildrenIndex(order, nodesById, []);
  const folderIds = ['common', 'from', 'to'];
  const source = { nodesById, index };
  const counts = deriveFolderContentCounts(source, folderIds, 0);
  const updated = { ...nodesById, branch: { ...nodesById.branch, parentNodeId: 'to' } };
  const nextIndex = buildWorkspaceListChildrenIndex([...order].reverse(), updated, [], source);
  Object.defineProperty(updated.excerpt, 'parentNodeId', { get: () => {
    throw new Error('A single move must use the cached subtree subtotal');
  } });

  const result = deriveFolderContentCounts({ nodesById: updated, index: nextIndex }, folderIds, 0, { source, counts });
  expect([...result.byFolderId]).toEqual(expect.arrayContaining([['from', 0], ['to', 3], ['common', 3]]));
  expect([...counts.byFolderId]).toEqual(expect.arrayContaining([['from', 3], ['to', 0], ['common', 3]]));
});

it('recomputes against the final batch when parent and descendant move together', () => {
  const listNodesById = {
    [HOME_NODE_ID]: node(HOME_NODE_ID, 'folder', null),
    a: node('a', 'folder', null), b: node('b', 'folder', null), c: node('c', 'folder', null),
    branch: node('branch', 'folder', 'a'), topic: node('topic', 'topic', 'branch'),
    item: node('item', 'item', 'topic'), replacement: node('replacement', 'topic', 'c')
  };
  const initial = { listNodesById, nodeOrder: Object.keys(listNodesById), trashedNodeIds: ['replacement'] };
  const data = buildWorkspaceDualListStructureData(initial);
  const batch = {
    ...initial, trashedNodeIds: ['topic'],
    listNodesById: {
      ...listNodesById, branch: { ...listNodesById.branch, parentNodeId: 'b' },
      item: { ...listNodesById.item, parentNodeId: 'c' }
    }
  };
  const updated = buildWorkspaceDualListStructureData(batch, { data, listNodesById });
  expect([...updated.folderCounts.byFolderId]).toEqual(expect.arrayContaining([
    [HOME_NODE_ID, 2], ['a', 0], ['b', 0], ['c', 2], ['branch', 0]
  ]));
  expect(updated.folderCounts.byFolderId).toEqual(buildWorkspaceDualListStructureData(batch).folderCounts.byFolderId);
});
