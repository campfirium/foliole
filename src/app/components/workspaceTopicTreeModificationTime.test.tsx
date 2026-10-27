import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { projectWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { patchWorkspaceRecord } from '../../shared/workspaceRecordPatch';

import { useWorkspaceDualListState } from './workspaceDualListState';
import { useWorkspaceTopicTreeLazyModel } from './workspaceTopicTreeLazyModel';
import { buildTopicChildrenByParent } from './workspaceTopicTreeLazyRows';

function topic(id: string, updatedAt: string): Node {
  return {
    id, kind: 'topic', title: id, parentNodeId: null, content: 'Body', reveal: '',
    review: null, createdAt: '2026-04-08T00:00:00.000Z', updatedAt
  };
}

it('refreshes modification sorting when only a projected timestamp changes', () => {
  const source = {
    older: topic('older', '2026-04-08T00:00:01.000Z'),
    newer: topic('newer', '2026-04-08T00:00:02.000Z')
  };
  let projection = projectWorkspaceListNodesById(source);
  const itemIds = ['older', 'newer'];
  const childrenByParent = buildTopicChildrenByParent(itemIds, projection);
  const trashedNodeIds: string[] = [];
  const { result, rerender } = renderHook(() => ({
    tree: useWorkspaceTopicTreeLazyModel({
      activeFolderId: 'root', activeNodeId: null, childrenByParent, itemIds,
      nodeOpenStateById: {}, nodesById: projection,
      sort: { key: 'modifiedAt', direction: 'desc' }
    }),
    structure: useWorkspaceDualListState({
      activeNodeId: null, isTrashViewOpen: false, listNodesById: projection,
      nodeOrder: itemIds, trashedNodeIds
    })
  }));
  const structure = result.current.structure;
  expect(result.current.tree.sortedItemIds).toEqual(['newer', 'older']);

  const next = patchWorkspaceRecord(source, {
    older: { ...source.older, updatedAt: '2026-04-08T00:00:03.000Z' }
  });
  projection = projectWorkspaceListNodesById(next, projection);
  rerender();
  expect(result.current.tree.sortedItemIds).toEqual(['older', 'newer']);
  expect(result.current.structure.folderNodeOrder).toBe(structure.folderNodeOrder);
  expect(result.current.structure.folderTopicCountById).toBe(structure.folderTopicCountById);
  expect(projection.older?.reading).toBe(source.older.reading ?? null);
  expect(projection.older?.review).toBe(source.older.review);
  expect(result.current.tree.rows.map((row) => row.node.updatedAt)).toEqual([
    '2026-04-08T00:00:03.000Z', source.newer.updatedAt
  ]);
});
