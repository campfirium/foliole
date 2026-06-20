import { expect, it } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  buildFolderNavigationNodeOrder,
  buildFolderNavigationNodesById,
  buildTopicNavigationNodesById,
  collectTopicColumnNodeIds,
  resolveActiveFolderColumnNodeId,
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

  expect(buildFolderNavigationNodeOrder(nodeOrder, nodesById, ['folder-case'])).toEqual([INBOX_NODE_ID, TRASH_NODE_ID]);
  expect(resolveFocusedFolderNodeId('topic-case-child', nodeOrder, nodesById, ['folder-case'])).toBe(INBOX_NODE_ID);
  expect(collectTopicColumnNodeIds('folder-case', nodeOrder, nodesById, ['topic-case-child'])).toEqual(['topic-case']);
});

it('uses lifecycle facts over stale trash projection in folder and topic columns', () => {
  const nodeOrder = [INBOX_NODE_ID, 'folder-restored', 'topic-restored', 'topic-deleted'];
  const nodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-restored': {
      ...createNode({ id: 'folder-restored', kind: 'folder', title: 'Restored' }),
      deletedAt: null
    } as NonNullable<WorkspaceListNodesById[string]>,
    'topic-deleted': {
      ...createNode({
        id: 'topic-deleted',
        kind: 'topic',
        parentNodeId: 'folder-restored',
        title: 'Deleted topic'
      }),
      deletedAt: '2026-05-24T00:00:00.000Z'
    } as NonNullable<WorkspaceListNodesById[string]>,
    'topic-restored': {
      ...createNode({
        id: 'topic-restored',
        kind: 'topic',
        parentNodeId: 'folder-restored',
        title: 'Restored topic'
      }),
      deletedAt: null
    } as NonNullable<WorkspaceListNodesById[string]>
  };

  expect(buildFolderNavigationNodeOrder(nodeOrder, nodesById, ['folder-restored', 'topic-restored'])).toEqual([
    INBOX_NODE_ID,
    'folder-restored',
    TRASH_NODE_ID
  ]);
  expect(collectTopicColumnNodeIds('folder-restored', nodeOrder, nodesById, ['topic-restored'])).toEqual([
    'topic-restored'
  ]);
});

it('pins trash to the end of the folder navigation', () => {
  const nodeOrder = [INBOX_NODE_ID, 'folder-b', 'folder-a'];
  const nodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'folder-b': createNode({ id: 'folder-b', kind: 'folder', title: 'Folder B' })
  };

  expect(buildFolderNavigationNodeOrder(nodeOrder, nodesById, [])).toEqual([
    INBOX_NODE_ID,
    'folder-b',
    'folder-a',
    TRASH_NODE_ID
  ]);
});

it('treats root-level guide folders as Inbox siblings for folder and topic columns', () => {
  const nodeOrder = [HOME_NODE_ID, INBOX_NODE_ID, 'demo-guides', 'demo-topic'];
  const nodesById: WorkspaceListNodesById = {
    [HOME_NODE_ID]: createNode({ id: HOME_NODE_ID, kind: 'folder', title: 'Home' }),
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'demo-guides': createNode({ id: 'demo-guides', kind: 'folder', title: 'Guides' }),
    'demo-topic': createNode({
      id: 'demo-topic',
      kind: 'topic',
      parentNodeId: 'demo-guides',
      title: 'Focused reading and review'
    })
  };

  expect(buildFolderNavigationNodeOrder(nodeOrder, nodesById, [])).toEqual([
    HOME_NODE_ID,
    INBOX_NODE_ID,
    'demo-guides',
    TRASH_NODE_ID
  ]);
  expect(buildFolderNavigationNodesById(nodeOrder, nodesById, [])['demo-guides']?.parentNodeId).toBe(HOME_NODE_ID);
  expect(resolveActiveFolderColumnNodeId('demo-topic', nodeOrder, nodesById, [])).toBe('demo-guides');
  expect(collectTopicColumnNodeIds('demo-guides', nodeOrder, nodesById, [])).toEqual(['demo-topic']);
});

it('builds sparse navigation node maps for the active columns only', () => {
  const nodeOrder = [INBOX_NODE_ID, 'folder-a', 'topic-a', 'topic-child'];
  const nodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
    'topic-child': createNode({ id: 'topic-child', kind: 'item', parentNodeId: 'topic-a', title: 'Child' })
  };

  expect(Object.keys(buildFolderNavigationNodesById(nodeOrder, nodesById, []))).toEqual([
    INBOX_NODE_ID,
    'folder-a',
    TRASH_NODE_ID
  ]);
  expect(Object.keys(buildTopicNavigationNodesById(['topic-a', 'topic-child'], nodesById))).toEqual([
    'topic-a',
    'topic-child'
  ]);
});
