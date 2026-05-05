import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { useWorkspaceStore } from '../../../store/workspaceStore';

import { NodeListTree } from './NodeListTree';

function createNode(args: {
  id: string;
  parentNodeId?: string | null;
  title: string;
  anchorLink?: { id: string; kind: 'highlight' };
}) {
  return {
    anchorLink: args.anchorLink ?? null,
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    parentNodeId: args.parentNodeId ?? null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function NodeListTreeHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'folder-a': createNode({ id: 'folder-a', title: 'Folder A' }),
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

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('opens the clicked row and toggles its branch when children exist', () => {
  render(<NodeListTreeHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  const articleRow = within(listPanel).getByRole('treeitem', { name: 'Article A' });

  expect(within(listPanel).getByRole('treeitem', { name: 'Highlight A1' })).toBeInTheDocument();

  fireEvent.click(articleRow);
  expect(articleRow).toHaveAttribute('aria-current', 'page');
  expect(within(listPanel).queryByRole('treeitem', { name: 'Highlight A1' })).not.toBeInTheDocument();

  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Article A' }));
  expect(within(listPanel).getByRole('treeitem', { name: 'Highlight A1' })).toBeInTheDocument();
});

it('shows every ctrl-selected row as selected', () => {
  render(<NodeListTreeHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Folder A' }), { ctrlKey: true });

  const selectedRows = within(listPanel).getAllByRole('treeitem', { selected: true });
  expect(selectedRows).toHaveLength(2);
  expect(within(listPanel).getByText('2 selected')).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Article A' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('data-active', 'false');
});
