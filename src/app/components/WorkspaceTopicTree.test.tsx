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
  expect(within(itemColumn).getByRole('button', { name: 'Expand all items' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('button', { name: 'Collapse all items' })).toBeInTheDocument();

  fireEvent.click(within(itemColumn).getByRole('treeitem', { name: 'React Notes' }));
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Hook Summary' })).not.toBeInTheDocument();

  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search node titles' }), {
    target: { value: 'hook' }
  });

  expect(within(itemColumn).getByRole('treeitem', { name: 'React Notes' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Vue Notes' })).toBeNull();
});
