import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { buildNodeTree, type NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNode } from '../model/workspaceListNode';

import {
  loadManualCollapsedNoteNodeIds,
  loadManualExpandedNoteNodeIds,
  saveManualCollapsedNoteNodeIds,
  saveManualExpandedNoteNodeIds
} from './nodeListCollapseSettings';
import { useCollapsedNodeState } from './NodeListCollapseState';

function createNode(
  id: string,
  title: string,
  parentNodeId: string | null,
  options?: { derived?: boolean }
): WorkspaceListNode {
  return {
    anchorLink: options?.derived ? { id: `${id}-anchor`, kind: 'highlight' } : null,
    createdAt: '2026-02-25T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    parentNodeId,
    review: null,
    title,
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

it('does not overwrite manual collapse memory when auto-expanding the active node path', async () => {
  saveManualCollapsedNoteNodeIds(['folder']);

  const nodeOrder = ['folder', 'article', 'highlight'];
  const nodesById: Record<string, WorkspaceListNode> = {
    folder: createNode('folder', 'Folder', null),
    article: createNode('article', 'Article', 'folder'),
    highlight: createNode('highlight', 'Highlight', 'article', { derived: true })
  };
  const tree = buildNodeTree(nodeOrder, nodesById);
  const emptyTrashRows: NodeTreeRow[] = [];
  interface HookProps {
    activeNodeId: string | null;
  }

  const { result, rerender } = renderHook(
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

  await waitFor(() => {
    expect(loadManualCollapsedNoteNodeIds()).toEqual(['folder']);
    expect(loadManualExpandedNoteNodeIds()).toEqual([]);
  });

  rerender({ activeNodeId: null });

  expect(result.current.collapsedNoteNodeIds.has('folder')).toBe(true);
});

it('lets manual collapse win over auto-expanded active ancestors', () => {
  const nodeOrder = ['folder', 'article', 'highlight'];
  const nodesById: Record<string, WorkspaceListNode> = {
    folder: createNode('folder', 'Folder', null),
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
    result.current.toggleNoteCollapse('folder');
  });

  expect(result.current.collapsedNoteNodeIds.has('folder')).toBe(true);
  expect(loadManualCollapsedNoteNodeIds()).toEqual(['folder']);
  expect(loadManualExpandedNoteNodeIds()).toEqual([]);
});

it('keeps collapse all effective even when the active node sits inside that branch', () => {
  saveManualExpandedNoteNodeIds(['folder']);

  const nodeOrder = ['folder', 'article', 'highlight'];
  const nodesById: Record<string, WorkspaceListNode> = {
    folder: createNode('folder', 'Folder', null),
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
