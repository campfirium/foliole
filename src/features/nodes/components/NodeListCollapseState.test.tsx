import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { buildNodeTree, type NodeTreeRow } from '../model/nodeTree';
import { HOME_NODE_ID } from '../model/specialNodes';
import type { WorkspaceListNode } from '../model/workspaceListNode';

import { resetNodeListCollapseSessionForTest } from './nodeListCollapseSession';
import {
  loadManualCollapsedNoteNodeIds,
  loadManualExpandedNoteNodeIds
} from './nodeListCollapseSettings';
import { useCollapsedNodeState } from './NodeListCollapseState';

function createNode(
  id: string,
  title: string,
  parentNodeId: string | null,
  options?: { derived?: boolean; kind?: 'folder' | 'topic' }
): WorkspaceListNode {
  return {
    anchorLink: options?.derived ? { id: `${id}-anchor`, kind: 'highlight' } : null,
    createdAt: '2026-02-25T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: options?.kind ?? 'topic',
    parentNodeId,
    review: null,
    ...(id === HOME_NODE_ID ? { specialKind: 'home' as const } : {}),
    title,
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetNodeListCollapseSessionForTest();
});

it('keeps Home expanded and outside manual collapse state', () => {
  const nodeOrder = [HOME_NODE_ID, 'folder', 'article'];
  const nodesById: Record<string, WorkspaceListNode> = {
    [HOME_NODE_ID]: createNode(HOME_NODE_ID, 'Home', null, { kind: 'folder' }),
    folder: createNode('folder', 'Folder', HOME_NODE_ID, { kind: 'folder' }),
    article: createNode('article', 'Article', 'folder')
  };
  const tree = buildNodeTree(nodeOrder, nodesById);
  const emptyTrashRows: NodeTreeRow[] = [];

  const { result } = renderHook(() =>
    useCollapsedNodeState({
      activeNodeId: HOME_NODE_ID,
      nodesById,
      noteParentById: tree.parentById,
      noteRowsAll: tree.rows,
      trashRowsAll: emptyTrashRows
    })
  );

  act(() => {
    result.current.toggleNoteCollapse(HOME_NODE_ID);
    result.current.collapseAllNotes();
  });

  expect(result.current.collapsedNoteNodeIds.has(HOME_NODE_ID)).toBe(false);
  expect(result.current.collapsedNoteNodeIds.has('folder')).toBe(true);
  expect(loadManualCollapsedNoteNodeIds()).toEqual(['folder']);
});

it('keeps collapsible folders collapsed even when the active node is inside them', async () => {
  const nodeOrder = ['folder', 'article', 'highlight'];
  const nodesById: Record<string, WorkspaceListNode> = {
    folder: createNode('folder', 'Folder', null, { kind: 'folder' }),
    article: createNode('article', 'Article', 'folder'),
    highlight: createNode('highlight', 'Highlight', 'article', { derived: true })
  };
  const tree = buildNodeTree(nodeOrder, nodesById);
  const emptyTrashRows: NodeTreeRow[] = [];
  interface HookProps {
    activeNodeId: string | null;
  }

  const { result } = renderHook(
    ({ activeNodeId }: HookProps) =>
      useCollapsedNodeState({
        activeNodeId,
        nodesById,
        noteParentById: tree.parentById,
        noteRowsAll: tree.rows,
        trashRowsAll: emptyTrashRows
      }),
    {
      initialProps: { activeNodeId: 'highlight' } as HookProps
    }
  );

  expect(result.current.collapsedNoteNodeIds.has('folder')).toBe(true);
  expect(result.current.collapsedNoteNodeIds.has('article')).toBe(true);

  await waitFor(() => {
    expect(loadManualCollapsedNoteNodeIds()).toEqual([]);
    expect(loadManualExpandedNoteNodeIds()).toEqual([]);
  });
});

it('expands only the manually toggled folder branch', () => {
  const nodeOrder = ['folder-a', 'article-a', 'folder-b', 'article-b'];
  const nodesById: Record<string, WorkspaceListNode> = {
    'folder-a': createNode('folder-a', 'Folder A', null, { kind: 'folder' }),
    'article-a': createNode('article-a', 'Article A', 'folder-a'),
    'folder-b': createNode('folder-b', 'Folder B', null, { kind: 'folder' }),
    'article-b': createNode('article-b', 'Article B', 'folder-b')
  };
  const tree = buildNodeTree(nodeOrder, nodesById);
  const emptyTrashRows: NodeTreeRow[] = [];

  const { result } = renderHook(() =>
    useCollapsedNodeState({
      activeNodeId: 'highlight',
      nodesById,
      noteParentById: tree.parentById,
      noteRowsAll: tree.rows,
      trashRowsAll: emptyTrashRows
    })
  );

  act(() => {
    result.current.toggleNoteCollapse('folder-a');
  });

  expect(result.current.collapsedNoteNodeIds.has('folder-a')).toBe(false);
  expect(result.current.collapsedNoteNodeIds.has('folder-b')).toBe(true);
  expect(loadManualCollapsedNoteNodeIds()).toEqual([]);
  expect(loadManualExpandedNoteNodeIds()).toEqual(['folder-a']);
});

it('keeps collapse all effective even when the active node sits inside that branch', () => {
  const nodeOrder = ['folder', 'article', 'highlight'];
  const nodesById: Record<string, WorkspaceListNode> = {
    folder: createNode('folder', 'Folder', null, { kind: 'folder' }),
    article: createNode('article', 'Article', 'folder'),
    highlight: createNode('highlight', 'Highlight', 'article', { derived: true })
  };
  const tree = buildNodeTree(nodeOrder, nodesById);
  const emptyTrashRows: NodeTreeRow[] = [];

  const { result } = renderHook(() =>
    useCollapsedNodeState({
      activeNodeId: 'highlight',
      nodesById,
      noteParentById: tree.parentById,
      noteRowsAll: tree.rows,
      trashRowsAll: emptyTrashRows
    })
  );

  act(() => {
    result.current.collapseAllNotes();
  });

  expect(result.current.collapsedNoteNodeIds.has('folder')).toBe(true);
  expect(result.current.collapsedNoteNodeIds.has('article')).toBe(true);
  expect(loadManualCollapsedNoteNodeIds()).toEqual(['folder', 'article']);
  expect(loadManualExpandedNoteNodeIds()).toEqual([]);
});
