import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeViewState } from '../../store/workspaceStore';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    ...overrides,
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

function renderFolderList(
  children: Node[],
  options?: {
    nodeViewById?: Record<string, NodeViewState | undefined>;
    sortDirection?: FolderListSortDirection;
    sortKey?: FolderListSortKey;
  }
) {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodeViewById={options?.nodeViewById ?? {}}
      nodesById={nodesById}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={vi.fn<(nodeId: string) => void>()}
      {...definedProps({
        sortDirection: options?.sortDirection,
        sortKey: options?.sortKey
      })}
    />
  );
}

function getRenderedEntryTitles() {
  return within(screen.getByRole('list', { name: 'Folder contents' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open\s+/, '') ?? '');
}

function renderDateSavedFolderList(folderNode: Node, children: Node[]) {
  return (
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodeViewById={{}}
      nodesById={Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]))}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={vi.fn<(nodeId: string) => void>()}
      sortDirection="desc"
      sortKey="dateSaved"
    />
  );
}

describe('FolderListView date sorting', () => {
  it('sorts entries by date modified by default', () => {
    renderFolderList([
      createNode({ createdAt: '2026-04-01T09:00:00.000Z', id: 'node-1', title: 'Old note', updatedAt: '2026-04-04T09:00:00.000Z' }),
      createNode({ createdAt: '2026-04-03T09:00:00.000Z', id: 'node-2', title: 'Newest note', updatedAt: '2026-04-01T09:00:00.000Z' }),
      createNode({ createdAt: '2026-04-02T09:00:00.000Z', id: 'node-3', title: 'Middle note', updatedAt: '2026-04-05T09:00:00.000Z' })
    ]);

    expect(getRenderedEntryTitles()).toEqual(['Middle note', 'Old note', 'Newest note']);
  });

  it('uses the same import time fallback chain for sorting and display', () => {
    renderFolderList(
      [
        createNode({
          id: 'node-4',
          title: 'Created fallback',
          createdAt: '2026-04-03T09:00:00.000Z',
          updatedAt: ''
        }),
        createNode({
          id: 'node-5',
          title: 'Updated value',
          createdAt: '2026-04-01T09:00:00.000Z',
          updatedAt: '2026-04-05T09:00:00.000Z'
        })
      ],
      { sortKey: 'dateImported' }
    );

    expect(getRenderedEntryTitles()).toEqual(['Created fallback', 'Updated value']);
    expect(screen.getByTestId('folder-list-date-node-4')).toHaveTextContent('2026-04-03');
    expect(screen.getByTestId('folder-list-date-node-5')).toHaveTextContent('2026-04-01');
  });

});

describe('FolderListView manual sorting', () => {
  it('uses name order before a folder has a manual child order', () => {
    renderFolderList(
      [
        createNode({ id: 'node-b', title: 'Beta' }),
        createNode({ id: 'node-a', title: 'Alpha' }),
        createNode({ id: 'node-c', title: 'Chapter 10' }),
        createNode({ id: 'node-d', title: 'Chapter 2' })
      ],
      { sortDirection: 'asc', sortKey: 'manual' }
    );

    expect(getRenderedEntryTitles()).toEqual(['Alpha', 'Beta', 'Chapter 2', 'Chapter 10']);
  });

  it('uses folder manual child order and appends missing children by name', () => {
    const children = [
      createNode({ id: 'node-a', title: 'Alpha' }),
      createNode({ id: 'node-b', title: 'Beta' }),
      createNode({ id: 'node-c', title: 'Chapter 2' })
    ];
    const folderNode = createNode({
      id: 'folder-1',
      kind: 'folder',
      manualChildOrder: ['node-b'],
      parentNodeId: null,
      title: 'Library root'
    });
    render(
      <FolderListView
        folderNodeId="folder-1"
        nodeOrder={['folder-1', ...children.map((node) => node.id)]}
        nodeViewById={{}}
        nodesById={Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]))}
        onChangeSortDirection={() => undefined}
        onChangeSortKey={() => undefined}
        onSelectNode={vi.fn<(nodeId: string) => void>()}
        sortDirection="asc"
        sortKey="manual"
      />
    );

    expect(screen.getByRole('button', { name: 'Sort list by Manual' })).toBeInTheDocument();
    expect(getRenderedEntryTitles()).toEqual(['Beta', 'Alpha', 'Chapter 2']);
  });
});

describe('FolderListView last opened sorting', () => {
  it('sorts by most recently opened when requested', () => {
    renderFolderList(
      [
        createNode({ id: 'node-1', title: 'Old open', updatedAt: '2026-04-03T09:00:00.000Z' }),
        createNode({ id: 'node-2', title: 'Newest open', updatedAt: '2026-04-01T09:00:00.000Z' }),
        createNode({ id: 'node-3', title: 'Never opened', updatedAt: '2026-04-02T09:00:00.000Z' })
      ],
      {
        nodeViewById: {
          'node-1': {
            scrollTop: 10,
            selection: { from: 1, to: 2 },
            updatedAt: '2026-04-02T09:00:00.000Z'
          },
          'node-2': {
            scrollTop: 20,
            selection: { from: 2, to: 3 },
            updatedAt: '2026-04-04T09:00:00.000Z'
          }
        },
        sortKey: 'dateLastOpened'
      }
    );

    expect(getRenderedEntryTitles()).toEqual(['Newest open', 'Old open', 'Never opened']);
    expect(screen.getByTestId('folder-list-date-node-2')).toHaveTextContent('2026-04-04');
    expect(screen.getByTestId('folder-list-date-node-3')).toHaveTextContent('Never opened');
  });

});

describe('FolderListView dynamic sorting', () => {
  it('keeps last opened order stable as nodes are opened', () => {
    const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
    const children = [
      createNode({ id: 'node-1', title: 'Opened first', updatedAt: '2026-04-03T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Opened later', updatedAt: '2026-04-02T09:00:00.000Z' })
    ];
    const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));
    const renderList = (nodeViewById: Record<string, NodeViewState | undefined>, sortKey: FolderListSortKey) => (
      <FolderListView
        folderNodeId="folder-1"
        nodeOrder={['folder-1', ...children.map((node) => node.id)]}
        nodeViewById={nodeViewById}
        nodesById={nodesById}
        onChangeSortDirection={() => undefined}
        onChangeSortKey={() => undefined}
        onSelectNode={vi.fn<(nodeId: string) => void>()}
        sortDirection="desc"
        sortKey={sortKey}
      />
    );
    const { rerender } = render(renderList({
      'node-1': { scrollTop: 0, selection: null, updatedAt: '2026-04-05T09:00:00.000Z' },
      'node-2': { scrollTop: 0, selection: null, updatedAt: '2026-04-04T09:00:00.000Z' }
    }, 'dateLastOpened'));

    expect(getRenderedEntryTitles()).toEqual(['Opened first', 'Opened later']);

    rerender(renderList({
      'node-1': { scrollTop: 0, selection: null, updatedAt: '2026-04-05T09:00:00.000Z' },
      'node-2': { scrollTop: 0, selection: null, updatedAt: '2026-04-06T09:00:00.000Z' }
    }, 'dateLastOpened'));

    expect(getRenderedEntryTitles()).toEqual(['Opened first', 'Opened later']);
    expect(screen.getByTestId('folder-list-date-node-2')).toHaveTextContent('2026-04-06');
  });

  it('keeps date saved sort order stable until the list is rebuilt', () => {
    const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
    const children = [
      createNode({ id: 'node-1', title: 'Saved first', updatedAt: '2026-04-05T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Saved later', updatedAt: '2026-04-04T09:00:00.000Z' })
    ];
    const { rerender } = render(renderDateSavedFolderList(folderNode, children));

    expect(getRenderedEntryTitles()).toEqual(['Saved first', 'Saved later']);

    rerender(renderDateSavedFolderList(folderNode, [
      createNode({ id: 'node-1', title: 'Saved first', updatedAt: '2026-04-05T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Saved later', updatedAt: '2026-04-06T09:00:00.000Z' })
    ]));

    expect(getRenderedEntryTitles()).toEqual(['Saved first', 'Saved later']);

    rerender(renderDateSavedFolderList(folderNode, [
      createNode({ id: 'node-1', title: 'Saved first', updatedAt: '2026-04-05T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Saved later', updatedAt: '2026-04-06T09:00:00.000Z' }),
      createNode({ id: 'node-3', title: 'New membership', updatedAt: '2026-04-07T09:00:00.000Z' })
    ]));

    expect(getRenderedEntryTitles()).toEqual(['New membership', 'Saved later', 'Saved first']);
  });
});
