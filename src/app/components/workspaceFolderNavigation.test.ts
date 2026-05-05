import { expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  buildFolderNavigationNodeOrder,
  collectTopicColumnNodeIds,
  resolveFocusedFolderNodeId
} from './workspaceFolderNavigation';

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}): NonNullable<WorkspaceListNodesById[string]> {
  return {
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

it('collects topic descendants in stable display order for the topic column', () => {
  const nodeOrder = [
    INBOX_NODE_ID,
    'folder-case',
    'topic-inbox',
    'topic-inbox-child',
    'topic-case',
    'topic-case-child',
    'item-case-card'
  ];
  const nodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-case': createNode({ id: 'folder-case', kind: 'folder', title: 'Case' }),
    'topic-inbox': createNode({
      id: 'topic-inbox',
      kind: 'topic',
      parentNodeId: INBOX_NODE_ID,
      title: 'Inbox topic'
    }),
    'topic-inbox-child': createNode({
      id: 'topic-inbox-child',
      kind: 'topic',
      parentNodeId: 'topic-inbox',
      title: 'Inbox child'
    }),
    'topic-case': createNode({
      id: 'topic-case',
      kind: 'topic',
      parentNodeId: 'folder-case',
      title: 'Case topic'
    }),
    'topic-case-child': createNode({
      id: 'topic-case-child',
      kind: 'topic',
      parentNodeId: 'topic-case',
      title: 'Case child'
    }),
    'item-case-card': createNode({
      id: 'item-case-card',
      kind: 'item',
      parentNodeId: 'folder-case',
      title: 'Case card'
    })
  };

  expect(collectTopicColumnNodeIds(INBOX_NODE_ID, nodeOrder, nodesById, [])).toEqual([
    'topic-inbox',
    'topic-inbox-child'
  ]);
  expect(collectTopicColumnNodeIds('folder-case', nodeOrder, nodesById, [])).toEqual([
    'topic-case',
    'topic-case-child',
    'item-case-card'
  ]);
});

it('ignores trashed nodes when resolving the folder and topic columns', () => {
  const nodeOrder = [INBOX_NODE_ID, 'folder-case', 'topic-case', 'topic-case-child'];
  const nodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-case': createNode({ id: 'folder-case', kind: 'folder', title: 'Case' }),
    'topic-case': createNode({
      id: 'topic-case',
      kind: 'topic',
      parentNodeId: 'folder-case',
      title: 'Case topic'
    }),
    'topic-case-child': createNode({
      id: 'topic-case-child',
      kind: 'topic',
      parentNodeId: 'topic-case',
      title: 'Case child'
    })
  };

  expect(buildFolderNavigationNodeOrder(nodeOrder, nodesById, ['folder-case'])).toEqual([INBOX_NODE_ID]);
  expect(resolveFocusedFolderNodeId('topic-case-child', nodeOrder, nodesById, ['folder-case'])).toBe(INBOX_NODE_ID);
  expect(collectTopicColumnNodeIds('folder-case', nodeOrder, nodesById, ['topic-case-child'])).toEqual(['topic-case']);
});
