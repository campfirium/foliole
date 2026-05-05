import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createNode(args: {
  id: string;
  parentNodeId?: string | null;
  title: string;
}) {
  return {
    anchorLink: null,
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

function WorkspaceTopicTreeHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode({ id: 'article-a', title: 'React Notes' }),
    'highlight-a': createNode({ id: 'highlight-a', parentNodeId: 'article-a', title: 'Hook Summary' }),
    'article-b': createNode({ id: 'article-b', title: 'Vue Notes' })
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={activeNodeId}
      itemIds={['article-a', 'highlight-a', 'article-b']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={setActiveNodeId}
    />
  );
}

function WorkspaceTopicTreeCollapseHarness() {
  const [activeFolderId, setActiveFolderId] = useState('folder-a');
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode({ id: 'article-a', title: 'React Notes' }),
    'highlight-a': createNode({ id: 'highlight-a', parentNodeId: 'article-a', title: 'Hook Summary' }),
    'article-b': createNode({ id: 'article-b', title: 'Vue Notes' }),
    'section-b': createNode({ id: 'section-b', title: 'Section B' }),
    'child-b': createNode({ id: 'child-b', parentNodeId: 'section-b', title: 'Child B' })
  };
  const itemIds = activeFolderId === 'folder-a'
    ? ['article-a', 'highlight-a', 'article-b']
    : ['section-b', 'child-b'];

  return (
    <>
      <button
        onClick={() => {
          setActiveFolderId('folder-b');
          setActiveNodeId('section-b');
        }}
        type="button"
      >
        Open folder B
      </button>
      <WorkspaceTopicTree
        activeFolderId={activeFolderId}
        activeNodeId={activeNodeId}
        itemIds={itemIds}
        nodesById={nodesById}
        onOpenMoveToNode={() => undefined}
        onSelectNode={setActiveNodeId}
      />
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('places title search in the item column and keeps matches visible while searching', () => {
  render(<WorkspaceTopicTreeHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });

  expect(within(itemColumn).getByRole('button', { name: 'Open title search' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('button', { name: 'Sort list by Saved time' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('button', { name: 'Collapse all topics' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Collapse all topics' }));
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Hook Summary' })).not.toBeInTheDocument();
  expect(within(itemColumn).getByRole('button', { name: 'Expand all topics' })).toBeInTheDocument();
  expect(within(itemColumn).queryByRole('button', { name: 'Collapse all topics' })).toBeNull();
  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Expand all topics' }));
  expect(within(itemColumn).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('button', { name: 'Collapse all topics' })).toBeInTheDocument();

  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'hook' }
  });

  expect(within(itemColumn).getByRole('treeitem', { name: 'React Notes' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Vue Notes' })).toBeNull();
});

it('shows every ctrl-selected current-folder topic as selected', () => {
  render(<WorkspaceTopicTreeHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.click(within(itemColumn).getByRole('treeitem', { name: 'Vue Notes' }), { ctrlKey: true });

  const selectedRows = within(itemColumn).getAllByRole('treeitem', { selected: true });
  expect(selectedRows).toHaveLength(2);
  expect(within(itemColumn).getByText('2 selected')).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'React Notes' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Vue Notes' })).toHaveAttribute('data-node-bulk-selected', 'true');
});

it('collapses a newly opened folder by default but expands the selected topic itself', () => {
  render(<WorkspaceTopicTreeCollapseHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });

  expect(within(itemColumn).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open folder B' }));

  expect(within(itemColumn).getByRole('treeitem', { name: 'Section B' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Child B' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('button', { name: 'Collapse all topics' })).toBeInTheDocument();
});
