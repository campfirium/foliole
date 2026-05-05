import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { useWorkspaceStore } from '../../../store/workspaceStore';

import { NodeListTree } from './NodeListTree';

function createNode(args: {
  id: string;
  kind?: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}) {
  return {
    anchorLink: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function NodeListTreeSearchHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');

  return (
    <NodeListTree
      activeNodeId={activeNodeId}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={['folder-a', 'article-a', 'highlight-a', 'article-b']}
      nodesById={{
        'folder-a': createNode({ id: 'folder-a', title: 'Folder A' }),
        'article-a': createNode({ id: 'article-a', parentNodeId: 'folder-a', title: 'React Notes' }),
        'highlight-a': createNode({ id: 'highlight-a', parentNodeId: 'article-a', title: 'Hook Summary' }),
        'article-b': createNode({ id: 'article-b', parentNodeId: 'folder-a', title: 'Vue Notes' })
      }}
      onOpenMoveToNode={() => undefined}
      onOpenNotesView={() => undefined}
      onSelectNode={setActiveNodeId}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId={null}
    />
  );
}

it('filters node titles while keeping the matched path visible', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));

  render(<NodeListTreeSearchHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'hook' }
  });

  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'React Notes' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Vue Notes' })).toBeNull();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: '' }
  });

  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Vue Notes' })).toBeInTheDocument();
});

it('toggles between collapsing and expanding all node groups from the toolbar button', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));

  render(<NodeListTreeSearchHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });

  expect(within(listPanel).getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();

  fireEvent.click(within(listPanel).getByRole('button', { name: 'Collapse all' }));

  expect(within(listPanel).queryByRole('treeitem', { name: 'Hook Summary' })).toBeNull();
  expect(within(listPanel).getByRole('button', { name: 'Expand all' })).toBeInTheDocument();

  fireEvent.click(within(listPanel).getByRole('button', { name: 'Expand all' }));

  expect(within(listPanel).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();
});

it('shows original path for trashed rows', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: ['highlight-a']
  }));

  render(
    <NodeListTree
      activeNodeId={null}
      isTrashViewOpen
      isVirtualViewOpen={false}
      nodeOrder={['folder-a', 'article-a', 'highlight-a']}
      nodesById={{
        'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
        'article-a': createNode({ id: 'article-a', kind: 'topic', parentNodeId: 'folder-a', title: 'React Notes' }),
        'highlight-a': createNode({ id: 'highlight-a', kind: 'item', parentNodeId: 'article-a', title: 'Hook Summary' })
      }}
      onOpenMoveToNode={() => undefined}
      onOpenNotesView={() => undefined}
      onSelectNode={() => undefined}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId="highlight-a"
    />
  );

  expect(screen.getByRole('treeitem', { name: /Hook Summary/ })).toBeInTheDocument();
  expect(screen.getByText('Folder A')).toBeInTheDocument();
});

it('searches trashed rows from the trash header', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: ['item-a', 'item-b']
  }));

  render(
    <NodeListTree
      activeNodeId={null}
      isTrashViewOpen
      isVirtualViewOpen={false}
      nodeOrder={['folder-a', 'item-a', 'item-b']}
      nodesById={{
        'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
        'item-a': createNode({ id: 'item-a', kind: 'item', parentNodeId: 'folder-a', title: 'Alpha Note' }),
        'item-b': createNode({ id: 'item-b', kind: 'item', parentNodeId: 'folder-a', title: 'Beta Note' })
      }}
      onOpenMoveToNode={() => undefined}
      onOpenNotesView={() => undefined}
      onSelectNode={() => undefined}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId="item-a"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'beta' }
  });

  expect(screen.queryByRole('treeitem', { name: /Alpha Note/ })).toBeNull();
  expect(screen.getByRole('treeitem', { name: /Beta Note/ })).toBeInTheDocument();
});
