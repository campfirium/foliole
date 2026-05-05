import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

function renderFolderList(
  children: Node[],
  options?: {
    nodeViewById?: Record<string, NodeViewState | undefined>;
    onSelectNode?: ReturnType<typeof vi.fn>;
    sortDirection?: FolderListSortDirection;
    sortKey?: FolderListSortKey;
  }
) {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));
  const onSelectNode = options?.onSelectNode ?? vi.fn();

  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodeViewById={options?.nodeViewById ?? {}}
      nodesById={nodesById}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={onSelectNode}
      sortDirection={options?.sortDirection}
      sortKey={options?.sortKey}
    />
  );

  return { onSelectNode };
}

function getRenderedEntryTitles() {
  return within(screen.getByRole('list', { name: 'Folder contents' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open\s+/, '') ?? '');
}

describe('FolderListView content', () => {
  it('shows title, opening, and date for entries with content', () => {
    renderFolderList([
      createNode({
        id: 'node-1',
        title: 'Child topic',
        content: '# Child topic\n\nThis is the first useful sentence inside the folder list body.\n\nSecond paragraph.',
        updatedAt: '2026-04-02T10:30:00.000Z'
      })
    ]);

    expect(screen.getByTestId('folder-list-title-node-1')).toHaveTextContent('Child topic');
    expect(screen.getByRole('heading', { level: 2, name: 'Library root' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Sort list by Date saved' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search folder contents' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-excerpt-node-1')).toHaveTextContent(
      'This is the first useful sentence inside the folder list body.'
    );
    expect(screen.getByTestId('folder-list-date-node-1')).toHaveTextContent('2026-04-02');
    expect(screen.queryByTestId('folder-list-meta-node-1')).not.toBeInTheDocument();
  });

  it('omits the third line when author data is missing', () => {
    renderFolderList([
      createNode({
        id: 'node-2',
        title: 'Untitled note',
        content: 'Body text without author metadata.'
      })
    ]);

    expect(screen.queryByTestId('folder-list-meta-node-2')).not.toBeInTheDocument();
  });
});

describe('FolderListView opening metadata', () => {
  it('skips frontmatter in openings and falls back to created date when updated date is unusable', () => {
    renderFolderList([
      createNode({
        id: 'node-3',
        title: 'Child topic',
        content: '---\nauthor: Ada\n---\n# Child topic\n\nUseful body text\n\nLater paragraph',
        createdAt: '2026-04-03T10:30:00.000Z',
        updatedAt: ''
      })
    ]);

    expect(screen.getByTestId('folder-list-excerpt-node-3')).toHaveTextContent('Useful body text');
    expect(screen.getByTestId('folder-list-excerpt-node-3')).not.toHaveTextContent('author: Ada');
    expect(screen.getByTestId('folder-list-date-node-3')).toHaveTextContent('2026-04-03');
    expect(screen.getByTestId('folder-list-meta-node-3')).toHaveTextContent('Ada');
  });

  it('shows the opening from the list snapshot when the node body is not loaded', () => {
    renderFolderList([
      createNode({
        id: 'node-6',
        title: 'Atomic Habits',
        content: '',
        openingText: 'Tiny changes compound into remarkable results.',
        updatedAt: '2026-04-03T10:30:00.000Z'
      })
    ]);

    expect(screen.getByTestId('folder-list-excerpt-node-6')).toHaveTextContent(
      'Tiny changes compound into remarkable results.'
    );
  });

  it('prefers the stored opening when the loaded body is only a cover marker', () => {
    renderFolderList([
      createNode({
        id: 'node-8',
        title: 'Small and Beautiful',
        content: '![Cover](asset://cover.png)',
        openingText: 'The real chapter opening should show here.'
      })
    ]);

    expect(screen.getByTestId('folder-list-excerpt-node-8')).toHaveTextContent(
      'The real chapter opening should show here.'
    );
  });

  it('keeps the opening area blank when no opening is available', () => {
    renderFolderList([
      createNode({
        id: 'node-7',
        title: 'No body yet',
        content: '',
        openingText: null
      })
    ]);

    expect(screen.getByTestId('folder-list-excerpt-node-7')).toHaveTextContent('');
    expect(screen.queryByText('No opening')).not.toBeInTheDocument();
    expect(screen.queryByText('No opening yet.')).not.toBeInTheDocument();
  });
});

describe('FolderListView date sorting', () => {
  it('sorts by latest updated date by default', () => {
    renderFolderList([
      createNode({ id: 'node-1', title: 'Old note', updatedAt: '2026-04-01T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Newest note', updatedAt: '2026-04-03T09:00:00.000Z' }),
      createNode({ id: 'node-3', title: 'Middle note', updatedAt: '2026-04-02T09:00:00.000Z' })
    ]);

    expect(getRenderedEntryTitles()).toEqual(['Newest note', 'Middle note', 'Old note']);
  });

  it('uses the same date fallback chain for sorting and display', () => {
    renderFolderList([
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
        updatedAt: '2026-04-02T09:00:00.000Z'
      })
    ]);

    expect(getRenderedEntryTitles()).toEqual(['Created fallback', 'Updated value']);
    expect(screen.getByTestId('folder-list-date-node-4')).toHaveTextContent('2026-04-03');
    expect(screen.getByTestId('folder-list-date-node-5')).toHaveTextContent('2026-04-02');
  });

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

describe('FolderListView secondary sorting', () => {
  it('switches to stable title sorting', () => {
    renderFolderList([
      createNode({ id: 'node-1', title: 'Beta', updatedAt: '2026-04-01T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Alpha', updatedAt: '2026-04-03T09:00:00.000Z' }),
      createNode({ id: 'node-3', title: 'Alpha', updatedAt: '2026-04-02T09:00:00.000Z' })
    ], { sortDirection: 'asc', sortKey: 'title' });

    expect(getRenderedEntryTitles()).toEqual(['Alpha', 'Alpha', 'Beta']);
  });
});

describe('FolderListView interactions', () => {
  it('opens the selected entry when a list item is clicked', () => {
    const { onSelectNode } = renderFolderList([
      createNode({ id: 'node-3', title: 'Open me', content: 'Preview body' })
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Open Open me' }));

    expect(onSelectNode).toHaveBeenCalledWith('node-3');
  });

  it('filters the current folder list from the toolbar search entry', () => {
    renderFolderList([
      createNode({ id: 'node-1', title: 'Alpha note', content: 'First body' }),
      createNode({ id: 'node-2', title: 'Beta note', content: 'Second body' })
    ]);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search folder contents' }), {
      target: { value: 'beta' }
    });

    expect(screen.queryByRole('button', { name: 'Open Alpha note' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Beta note' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('1 / 2');
  });
});
