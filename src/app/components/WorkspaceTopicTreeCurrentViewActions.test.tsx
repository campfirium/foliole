import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    anchorLink: overrides.anchorLink ?? null,
    content: overrides.content ?? 'Body',
    createdAt: overrides.createdAt ?? '2026-04-20T00:00:00.000Z',
    hasContent: overrides.hasContent ?? true,
    hasReveal: overrides.hasReveal ?? false,
    id: overrides.id,
    kind: overrides.kind ?? 'topic',
    parentNodeId: overrides.parentNodeId === undefined ? 'folder-a' : overrides.parentNodeId,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    title: overrides.title,
    updatedAt: overrides.updatedAt ?? '2026-04-20T00:00:00.000Z'
  };
}

function renderFolderListActions(onOpenMoveToNode = vi.fn()) {
  const folder = createNode({ id: 'folder-a', kind: 'folder', parentNodeId: null, title: 'Inbox' });
  const nodes = [
    folder,
    createNode({ id: 'article-a', title: 'React Notes' }),
    createNode({ id: 'article-b', title: 'Vue Notes' }),
    createNode({
      anchorLink: { id: 'anchor-a', kind: 'highlight' },
      id: 'derived-a',
      title: 'Hook Summary'
    })
  ];

  render(
    <FolderListView
      folderNodeId="folder-a"
      nodeOrder={nodes.map((node) => node.id)}
      nodesById={Object.fromEntries(nodes.map((node) => [node.id, node]))}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onOpenMoveToNode={onOpenMoveToNode}
      onSelectNode={() => undefined}
      sortKey="dateImported"
    />
  );

  return { onOpenMoveToNode };
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('opens current view actions from the folder list title row for the filtered topic snapshot', () => {
  const { onOpenMoveToNode } = renderFolderListActions();

  expect(screen.getByRole('heading', { level: 2, name: 'Inbox' })).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-count')).toHaveTextContent('3');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search folder contents' }), {
    target: { value: 'vue' }
  });

  fireEvent.keyDown(screen.getByRole('button', { name: 'Current view actions' }), { key: 'ArrowDown' });
  expect(screen.getByText('Current view')).toBeInTheDocument();
  expect(screen.getByText('1 topic')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Move topics...' }));

  expect(onOpenMoveToNode).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'article-b', parentNodeId: 'folder-a' })
  ]);
});

it('confirms before deleting topics in the current folder view', () => {
  const deleteNodes = vi.fn();
  useWorkspaceStore.setState((state) => ({ ...state, deleteNodes }));
  renderFolderListActions();

  fireEvent.keyDown(screen.getByRole('button', { name: 'Current view actions' }), { key: 'ArrowDown' });
  expect(screen.getByText('3 topics')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete topics...' }));

  expect(deleteNodes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete topics' }));

  expect(deleteNodes).toHaveBeenCalledWith(expect.arrayContaining(['article-a', 'article-b', 'derived-a']));
});
