import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    id: overrides.id,
    parentNodeId: overrides.parentNodeId ?? 'folder-1',
    kind: overrides.kind ?? 'topic',
    title: overrides.title,
    content: overrides.content ?? '',
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T09:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-02T10:30:00.000Z'
  };
}

function renderFolderList(children: Node[], onSelectNode = vi.fn()) {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodesById={nodesById}
      onSelectNode={onSelectNode}
    />
  );

  return { onSelectNode };
}

describe('FolderListView', () => {
  it('shows title, summary, and date for entries with content', () => {
    renderFolderList([
      createNode({
        id: 'node-1',
        title: 'Child topic',
        content: '# Child topic\nThis is the first useful sentence inside the folder list body.',
        updatedAt: '2026-04-02T10:30:00.000Z'
      })
    ]);

    expect(screen.getByTestId('folder-list-title-node-1')).toHaveTextContent('Child topic');
    expect(screen.getByTestId('folder-list-excerpt-node-1')).toHaveTextContent(
      'This is the first useful sentence inside the folder list body.'
    );
    expect(screen.getByTestId('folder-list-date-node-1')).toHaveTextContent('2026-04-02');
  });

  it('keeps the author slot stable when author data is missing', () => {
    renderFolderList([
      createNode({
        id: 'node-2',
        title: 'Untitled note',
        content: 'Body text without author metadata.'
      })
    ]);

    const authorSlot = screen.getByTestId('folder-list-author-node-2');
    expect(authorSlot).toBeInTheDocument();
    expect(authorSlot).toHaveTextContent('');
    expect(authorSlot).toHaveAttribute('aria-label', 'Author unavailable');
    expect(authorSlot.className).toContain('min-h-4');
  });

  it('opens the selected entry when a list item is clicked', () => {
    const { onSelectNode } = renderFolderList([
      createNode({ id: 'node-3', title: 'Open me', content: 'Preview body' })
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Open Open me' }));

    expect(onSelectNode).toHaveBeenCalledWith('node-3');
  });

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
    expect(screen.getByTestId('folder-list-excerpt-node-4')).toHaveTextContent('No summary yet.');
    expect(screen.getByTestId('folder-list-excerpt-node-4').className).toContain('line-clamp-2');
    expect(screen.getByTestId('folder-list-excerpt-node-5').className).toContain('line-clamp-2');
    expect(screen.getByTestId('folder-list-excerpt-node-5').className).toContain('min-h-10');
  });
});
