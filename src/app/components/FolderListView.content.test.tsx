import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

function renderFolderList(children: Node[]) {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodeViewById={{}}
      nodesById={nodesById}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={vi.fn<(nodeId: string) => void>()}
    />
  );
}

describe('FolderListView content', () => {
  it('shows title, opening, and date for entries with content', () => {
    renderFolderList([
      createNode({
        id: 'node-1',
        title: 'Child topic',
        content: '# Child topic\n\nThis is the first useful sentence inside the folder list body.\n\nSecond paragraph.',
        createdAt: '2026-04-02T10:30:00.000Z',
        updatedAt: '2026-04-02T10:30:00.000Z'
      })
    ]);

    expect(screen.getByTestId('folder-list-title-node-1')).toHaveTextContent('Child topic');
    expect(screen.getByRole('heading', { level: 2, name: 'Library root' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
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

  it('renders markdown titles and summaries as readable list text', () => {
    renderFolderList([
      createNode({
        id: 'node-3',
        title: '## **前体**',
        content: '## **色氨酸**\n\n![Cover](asset://cover.png) [Project](https://example.com) helps make serotonin.'
      })
    ]);

    expect(screen.getByTestId('folder-list-title-node-3')).toHaveTextContent('前体');
    expect(screen.getByTestId('folder-list-excerpt-node-3')).toHaveTextContent(
      '色氨酸 Cover Project helps make serotonin.'
    );
    expect(screen.queryByText(/##|\*\*|asset:\/\//)).not.toBeInTheDocument();
  });
});
