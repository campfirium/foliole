import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

function renderFolderList(children: Node[], options?: { onSelectNode?: ReturnType<typeof vi.fn>; sortKey?: FolderListSortKey }) {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));
  const onSelectNode = options?.onSelectNode ?? vi.fn();

  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodesById={nodesById}
      onChangeSortKey={() => undefined}
      onSelectNode={onSelectNode}
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
    expect(screen.getByRole('heading', { level: 2, name: 'Content list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort list by Date' })).toBeInTheDocument();
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
});

describe('FolderListView secondary sorting', () => {
  it('switches to stable title sorting', () => {
    renderFolderList([
      createNode({ id: 'node-1', title: 'Beta', updatedAt: '2026-04-01T09:00:00.000Z' }),
      createNode({ id: 'node-2', title: 'Alpha', updatedAt: '2026-04-03T09:00:00.000Z' }),
      createNode({ id: 'node-3', title: 'Alpha', updatedAt: '2026-04-02T09:00:00.000Z' })
    ], { sortKey: 'title' });

    expect(getRenderedEntryTitles()).toEqual(['Alpha', 'Alpha', 'Beta']);
  });

  it('keeps author sorting stable when some authors are missing', () => {
    renderFolderList([
      createNode({
        id: 'node-1',
        title: 'No author B',
        content: 'Body only',
        updatedAt: '2026-04-03T09:00:00.000Z'
      }),
      createNode({
        id: 'node-2',
        title: 'Named author',
        content: '---\nauthor: Zoe\n---\nBody only',
        updatedAt: '2026-04-02T09:00:00.000Z'
      }),
      createNode({
        id: 'node-3',
        title: 'No author A',
        content: 'More body only',
        updatedAt: '2026-04-01T09:00:00.000Z'
      })
    ], { sortKey: 'author' });

    expect(getRenderedEntryTitles()).toEqual(['Named author', 'No author A', 'No author B']);
    expect(screen.getByTestId('folder-list-meta-node-2')).toHaveTextContent('Zoe');
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

    fireEvent.click(screen.getByRole('button', { name: 'Search folder contents' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search folder contents' }), {
      target: { value: 'beta' }
    });

    expect(screen.queryByRole('button', { name: 'Open Alpha note' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Beta note' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 items')).toBeInTheDocument();
  });
});

describe('FolderListView layout', () => {
  it('keeps long titles, empty bodies, and long summaries clamped inside the row', () => {
    renderFolderList([
      createNode({
        id: 'node-4',
        title: 'An extremely long title that should stay readable without pushing the whole folder list row out of shape',
        content: ''
      }),
      createNode({
        id: 'node-5',
        title: 'Long summary',
        content: 'This summary keeps going '.repeat(40)
      })
    ]);

    expect(screen.getByTestId('folder-list-title-node-4').className).toContain('line-clamp-2');
    expect(screen.getByTestId('folder-list-excerpt-node-4')).toHaveTextContent('');
    expect(screen.getByTestId('folder-list-excerpt-node-4').className).toContain('line-clamp-2');
    expect(screen.getByTestId('folder-list-excerpt-node-4').className).toContain('min-h-14');
    expect(screen.getByTestId('folder-list-excerpt-node-5').className).toContain('line-clamp-2');
    expect(screen.getByTestId('folder-list-excerpt-node-5').className).toContain('min-h-14');
    expect(screen.queryByText('Topic')).not.toBeInTheDocument();
  });
});
