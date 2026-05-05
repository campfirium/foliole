import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    id: overrides.id,
    parentNodeId: overrides.parentNodeId === undefined ? 'folder-1' : overrides.parentNodeId,
    kind: overrides.kind ?? 'topic',
    title: overrides.title,
    content: overrides.content ?? '',
    openingText: overrides.openingText ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T09:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-02T10:30:00.000Z'
  };
}

function getRenderedEntryTitles() {
  return within(screen.getByRole('list', { name: 'Folder contents' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open\s+/, '') ?? '');
}

it('updates a controlled sort key through the toolbar menu', () => {
  function ControlledFolderList() {
    const [sortKey, setSortKey] = useState<FolderListSortKey>('date');
    const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
    const children = [
      createNode({ id: 'node-1', title: 'Beta', updatedAt: '2026-04-01T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Alpha', updatedAt: '2026-04-03T09:00:00.000Z' })
    ];
    const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

    return (
      <FolderListView
        folderNodeId="folder-1"
        nodeOrder={['folder-1', ...children.map((node) => node.id)]}
        nodesById={nodesById}
        onChangeSortKey={setSortKey}
        onSelectNode={() => undefined}
        sortKey={sortKey}
      />
    );
  }

  render(<ControlledFolderList />);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Date' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Title' }));

  expect(screen.getByRole('button', { name: 'Sort list by Title' })).toBeInTheDocument();
  expect(getRenderedEntryTitles()).toEqual(['Alpha', 'Beta']);
});
