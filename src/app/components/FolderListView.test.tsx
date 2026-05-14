import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
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
    onSelectNode?: (nodeId: string) => void;
    sortDirection?: FolderListSortDirection;
    sortKey?: FolderListSortKey;
  }
) {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));
  const onSelectNode = options?.onSelectNode ?? vi.fn<(nodeId: string) => void>();

  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodeViewById={options?.nodeViewById ?? {}}
      nodesById={nodesById}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={onSelectNode}
      {...definedProps({
        sortDirection: options?.sortDirection,
        sortKey: options?.sortKey
      })}
    />
  );

  return { onSelectNode };
}

describe('FolderListView opening metadata', () => {
  it('skips frontmatter in openings and shows the import date', () => {
    renderFolderList(
      [
        createNode({
          id: 'node-3',
          title: 'Child topic',
          content: '---\nauthor: Ada\n---\n# Child topic\n\nUseful body text\n\nLater paragraph',
          createdAt: '2026-04-03T10:30:00.000Z',
          updatedAt: ''
        })
      ],
      { sortKey: 'dateImported' }
    );

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
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('2');
    expect(screen.getByLabelText('Folder search results 1 / 2')).toBeInTheDocument();
  });

  it('shows the real path on a second line for virtual results and splits title/path actions', () => {
    const onSelectNode = vi.fn();
    const onSelectNodePath = vi.fn();
    const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
    const childFolder = createNode({ id: 'topic-folder', kind: 'folder', parentNodeId: 'folder-1', title: 'Reading' });
    const articleNode = createNode({
      id: 'node-9',
      parentNodeId: 'topic-folder',
      title: 'Small and Beautiful',
      content: 'A calm opening paragraph.'
    });
    const nodesById = Object.fromEntries([folderNode, childFolder, articleNode].map((node) => [node.id, node]));

    render(
      <FolderListView
        itemLayout="virtual-result"
        nodes={[articleNode]}
        nodesById={nodesById}
        onSelectNode={onSelectNode}
        onSelectNodePath={onSelectNodePath}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Small and Beautiful' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open real location for Small and Beautiful' })).toHaveTextContent(
      'Library root / Reading'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Small and Beautiful' }));
    expect(onSelectNode).toHaveBeenCalledWith('node-9');

    fireEvent.click(screen.getByRole('button', { name: 'Open real location for Small and Beautiful' }));
    expect(onSelectNodePath).toHaveBeenCalledWith('node-9');
  });
});
