import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { useWorkspaceStore } from '../../../store/workspaceStore';

import { NodeListTree } from './NodeListTree';

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

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search node titles' }), {
    target: { value: 'hook' }
  });

  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'React Notes' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Vue Notes' })).toBeNull();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search node titles' }), {
    target: { value: '' }
  });

  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Hook Summary' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Vue Notes' })).toBeInTheDocument();
});
