import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';

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
    const [sortKey, setSortKey] = useState<FolderListSortKey>('dateImported');
    const [sortDirection, setSortDirection] = useState<FolderListSortDirection>('desc');
    const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
    const children = [
      createNode({ id: 'node-1', title: 'Beta', updatedAt: '2026-04-01T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Alpha', updatedAt: '2026-04-03T09:00:00.000Z' })
    ];
    const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));
    const nodeViewById: Record<string, NodeViewState | undefined> = {};

    return (
      <FolderListView
        folderNodeId="folder-1"
        nodeOrder={['folder-1', ...children.map((node) => node.id)]}
        nodeViewById={nodeViewById}
        nodesById={nodesById}
        onChangeSortDirection={setSortDirection}
        onChangeSortKey={setSortKey}
        onSelectNode={() => undefined}
        sortDirection={sortDirection}
        sortKey={sortKey}
      />
    );
  }

  render(<ControlledFolderList />);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Date imported' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Date modified' }));

  expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
  expect(getRenderedEntryTitles()).toEqual(['Alpha', 'Beta']);
});

it('updates a controlled sort direction through the toolbar menu', () => {
  function ControlledFolderList() {
    const [sortKey] = useState<FolderListSortKey>('dateImported');
    const [sortDirection, setSortDirection] = useState<FolderListSortDirection>('desc');
    const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
    const children = [
      createNode({ createdAt: '2026-04-01T09:00:00.000Z', id: 'node-1', title: 'First imported', updatedAt: '2026-04-03T09:00:00.000Z' }),
      createNode({ createdAt: '2026-04-03T09:00:00.000Z', id: 'node-2', title: 'Last imported', updatedAt: '2026-04-01T09:00:00.000Z' })
    ];
    const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

    return (
      <FolderListView
        folderNodeId="folder-1"
        nodeOrder={['folder-1', ...children.map((node) => node.id)]}
        nodeViewById={{}}
        nodesById={nodesById}
        onChangeSortDirection={setSortDirection}
        onChangeSortKey={() => undefined}
        onSelectNode={() => undefined}
        sortDirection={sortDirection}
        sortKey={sortKey}
      />
    );
  }

  render(<ControlledFolderList />);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Date imported' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Older -> Recent' }));

  expect(getRenderedEntryTitles()).toEqual(['First imported', 'Last imported']);
});

it('refreshes last-opened order when the active sort option is selected again', () => {
  function ControlledFolderList() {
    const [sortKey, setSortKey] = useState<FolderListSortKey>('dateLastOpened');
    const [sortDirection, setSortDirection] = useState<FolderListSortDirection>('desc');
    const [nodeViewById, setNodeViewById] = useState<Record<string, NodeViewState | undefined>>({
      'node-1': { scrollTop: 0, selection: null, updatedAt: '2026-04-01T09:00:00.000Z' },
      'node-2': { scrollTop: 0, selection: null, updatedAt: '2026-04-02T09:00:00.000Z' }
    });
    const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
    const children = [
      createNode({ id: 'node-1', title: 'Earlier' }),
      createNode({ id: 'node-2', title: 'Latest' })
    ];
    const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

    return (
      <>
        <button
          onClick={() =>
            setNodeViewById({
              'node-1': { scrollTop: 0, selection: null, updatedAt: '2026-04-03T09:00:00.000Z' },
              'node-2': { scrollTop: 0, selection: null, updatedAt: '2026-04-02T09:00:00.000Z' }
            })
          }
          type="button"
        >
          Simulate opened node
        </button>
        <FolderListView
          folderNodeId="folder-1"
          nodeOrder={['folder-1', ...children.map((node) => node.id)]}
          nodeViewById={nodeViewById}
          nodesById={nodesById}
          onChangeSortDirection={setSortDirection}
          onChangeSortKey={setSortKey}
          onSelectNode={() => undefined}
          sortDirection={sortDirection}
          sortKey={sortKey}
        />
      </>
    );
  }

  render(<ControlledFolderList />);

  expect(getRenderedEntryTitles()).toEqual(['Latest', 'Earlier']);

  fireEvent.click(screen.getByRole('button', { name: 'Simulate opened node' }));
  expect(getRenderedEntryTitles()).toEqual(['Latest', 'Earlier']);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Last opened' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Last opened' }));

  expect(getRenderedEntryTitles()).toEqual(['Earlier', 'Latest']);
});
