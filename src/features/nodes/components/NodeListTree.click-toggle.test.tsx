import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../../store/workspaceStore';

import { NodeListTree } from './NodeListTree';

function createNode(args: {
  id: string;
  parentNodeId?: string | null;
  title: string;
  anchorLink?: { id: string; kind: 'highlight' };
  kind?: 'folder' | 'topic';
}) {
  return {
    anchorLink: args.anchorLink ?? null,
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    kind: args.kind ?? 'topic',
    parentNodeId: args.parentNodeId ?? null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function NodeListTreeHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'article-a': createNode({ id: 'article-a', parentNodeId: 'folder-a', title: 'Article A' }),
    'highlight-a1': createNode({
      id: 'highlight-a1',
      parentNodeId: 'article-a',
      title: 'Highlight A1',
      anchorLink: { id: 'hl-a1', kind: 'highlight' }
    })
  };

  return (
    <NodeListTree
      activeNodeId={activeNodeId}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={['folder-a', 'article-a', 'highlight-a1']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onOpenNotesView={() => undefined}
      onSelectNode={setActiveNodeId}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId={null}
    />
  );
}

function RootNodeListTreeHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode({ id: 'article-a', title: 'Article A' }),
    'article-b': createNode({ id: 'article-b', title: 'Article B' }),
    'article-c': createNode({ id: 'article-c', title: 'Article C' })
  };

  return (
    <NodeListTree
      activeNodeId={activeNodeId}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={['article-a', 'article-b', 'article-c']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onOpenNotesView={() => undefined}
      onSelectNode={setActiveNodeId}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId={null}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('expands only the clicked folder branch', () => {
  renderWithLocalization(<NodeListTreeHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  const folderRow = within(listPanel).getByRole('treeitem', { name: 'Folder A' });

  expect(within(listPanel).queryByRole('treeitem', { name: 'Article A' })).toBeNull();

  fireEvent.click(folderRow);
  expect(folderRow).toHaveAttribute('aria-current', 'page');
  expect(within(listPanel).getByRole('treeitem', { name: 'Article A' })).toBeInTheDocument();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Highlight A1' })).toBeNull();

  fireEvent.click(folderRow);
  expect(within(listPanel).getByRole('treeitem', { name: 'Article A' })).toBeInTheDocument();
});

it('shows every ctrl-selected row as selected', () => {
  renderWithLocalization(<NodeListTreeHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Folder A' }));
  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Article A' }), { ctrlKey: true });

  const selectedRows = within(listPanel).getAllByRole('treeitem', { selected: true });
  expect(selectedRows).toHaveLength(2);
  expect(within(listPanel).queryByText('2 selected')).toBeNull();
  expect(within(listPanel).getByRole('treeitem', { name: 'Article A' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(listPanel).getByRole('treeitem', { name: 'Article A' })).toHaveAttribute('data-active', 'false');
});

it('keeps the full start-to-end range selected after shift-click', () => {
  renderWithLocalization(<RootNodeListTreeHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Article A' }));
  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Article C' }), { shiftKey: true });

  expect(within(listPanel).getAllByRole('treeitem', { selected: true })).toHaveLength(3);
  expect(within(listPanel).getByRole('treeitem', { name: 'Article A' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(listPanel).getByRole('treeitem', { name: 'Article B' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(listPanel).getByRole('treeitem', { name: 'Article C' })).toHaveAttribute('data-node-bulk-selected', 'true');
});
