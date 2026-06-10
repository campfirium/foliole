import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createNode(args: {
  createdAt?: string;
  id: string;
  parentNodeId?: string | null;
  title: string;
  updatedAt?: string;
}) {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: args.createdAt ?? '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    kind: 'topic' as const,
    parentNodeId: args.parentNodeId ?? null,
    reveal: null,
    review: null,
    title: args.title,
    updatedAt: args.updatedAt ?? '2026-04-20T00:00:00.000Z'
  };
}

function WorkspaceTopicTreeSelectionHarness(props: { onSelectNode?: (nodeId: string) => void }) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode({ id: 'article-a', title: 'React Notes' }),
    'article-b': createNode({ id: 'article-b', title: 'Vue Notes' })
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={activeNodeId}
      itemIds={['article-a', 'article-b']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={(nodeId) => {
        setActiveNodeId(nodeId);
        props.onSelectNode?.(nodeId);
      }}
    />
  );
}

function WorkspaceTopicTreeSortedSelectionHarness(props: { onSelectNode?: (nodeId: string) => void }) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode({
      createdAt: '2026-04-23T00:00:00.000Z',
      id: 'article-a',
      title: 'Alpha Notes',
      updatedAt: '2026-04-20T00:00:00.000Z'
    }),
    'article-b': createNode({
      createdAt: '2026-04-21T00:00:00.000Z',
      id: 'article-b',
      title: 'Middle Notes',
      updatedAt: '2026-04-24T00:00:00.000Z'
    }),
    'article-c': createNode({
      createdAt: '2026-04-22T00:00:00.000Z',
      id: 'article-c',
      title: 'Omega Notes',
      updatedAt: '2026-04-19T00:00:00.000Z'
    })
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={activeNodeId}
      itemIds={['article-a', 'article-b', 'article-c']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={(nodeId) => {
        setActiveNodeId(nodeId);
        props.onSelectNode?.(nodeId);
      }}
    />
  );
}

function WorkspaceTopicTreeFocusedSelectionHarness() {
  const nodesById = {
    parent: createNode({ id: 'parent', title: 'Parent' }),
    'topic-a': createNode({ id: 'topic-a', title: 'Alpha Notes' }),
    'highlight-b': {
      ...createNode({ id: 'highlight-b', title: 'Beta Highlight' }),
      anchorLink: {
        id: 'highlight-anchor',
        kind: 'highlight' as const,
        locator: { from: 0, originalText: 'Beta', to: 4 }
      }
    },
    'topic-c': createNode({ id: 'topic-c', title: 'Omega Notes' })
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="parent"
      itemIds={['topic-a', 'highlight-b', 'topic-c']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {
      parent: { selection: { from: 2, to: 2 }, scrollTop: 0, updatedAt: '2026-04-20T00:00:00.000Z' }
    },
    trashedNodeIds: []
  }));
});

it('shows every ctrl-selected current-folder topic as selected', () => {
  renderWithLocalization(<WorkspaceTopicTreeSelectionHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.click(within(itemColumn).getByRole('treeitem', { name: 'Vue Notes' }), { ctrlKey: true });

  const selectedRows = within(itemColumn).getAllByRole('treeitem', { selected: true });
  expect(selectedRows).toHaveLength(2);
  expect(within(itemColumn).queryByText('2 selected')).toBeNull();
  expect(within(itemColumn).getByRole('treeitem', { name: 'React Notes' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Vue Notes' })).toHaveAttribute('data-node-bulk-selected', 'true');
});

it('selects shift ranges by the sorted visible order in the item column without opening the target', () => {
  const onSelectNode = vi.fn();
  renderWithLocalization(<WorkspaceTopicTreeSortedSelectionHarness onSelectNode={onSelectNode} />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.click(within(itemColumn).getByRole('treeitem', { name: 'Omega Notes' }), { shiftKey: true });

  const selectedRows = within(itemColumn).getAllByRole('treeitem', { selected: true });
  expect(selectedRows).toHaveLength(2);
  expect(within(itemColumn).queryByText('2 selected')).toBeNull();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Alpha Notes' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Omega Notes' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Middle Notes' })).toHaveAttribute('aria-selected', 'false');
  expect(onSelectNode).not.toHaveBeenCalled();
});

it('does not use a focus proxy as the shift range anchor', () => {
  renderWithLocalization(<WorkspaceTopicTreeFocusedSelectionHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.click(within(itemColumn).getByRole('treeitem', { name: 'Omega Notes' }), { shiftKey: true });

  expect(within(itemColumn).getAllByRole('treeitem', { selected: true })).toHaveLength(1);
  expect(within(itemColumn).getByRole('treeitem', { name: 'Omega Notes' })).toHaveAttribute('aria-selected', 'true');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Beta Highlight' })).toHaveAttribute('aria-selected', 'false');
});
