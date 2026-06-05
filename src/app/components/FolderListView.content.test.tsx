import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { HOME_NODE_ID } from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

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
    updatedAt: overrides.updatedAt ?? '2026-04-02T10:30:00.000Z',
    ...(overrides.anchorLink !== undefined ? { anchorLink: overrides.anchorLink } : {}),
    ...(overrides.deletedAt !== undefined ? { deletedAt: overrides.deletedAt } : {})
  };
}

function renderFolderList(children: Node[]) {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

  renderWithLocalization(
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

function buildHomeFolderListNodes() {
  const homeNode = createNode({
    id: HOME_NODE_ID,
    kind: 'folder',
    parentNodeId: null,
    title: 'Home'
  });
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const rootTopic = createNode({ id: 'root-topic', parentNodeId: null, title: 'Root topic' });
  const folderTopic = createNode({ id: 'folder-topic', parentNodeId: 'folder-1', title: 'Folder topic' });
  const childTopic = createNode({ id: 'child-topic', parentNodeId: 'folder-topic', title: 'Child topic' });
  const highlightNode = createNode({
    id: 'highlight-1',
    anchorLink: { id: 'anchor-1', kind: 'highlight' },
    parentNodeId: 'folder-topic',
    title: 'Highlight'
  });
  const reviewItem = createNode({
    id: 'review-item',
    kind: 'item',
    parentNodeId: 'folder-topic',
    title: 'Review item'
  });
  const deletedTopic = createNode({
    id: 'deleted-topic',
    deletedAt: '2026-04-03T10:30:00.000Z',
    parentNodeId: null,
    title: 'Deleted topic'
  });
  return [homeNode, folderNode, rootTopic, folderTopic, childTopic, highlightNode, reviewItem, deletedTopic];
}

function renderHomeFolderList() {
  const nodes = buildHomeFolderListNodes();
  renderWithLocalization(
    <FolderListView
      folderNodeId={HOME_NODE_ID}
      nodeOrder={nodes.map((node) => node.id)}
      nodeViewById={{}}
      nodesById={Object.fromEntries(nodes.map((node) => [node.id, node]))}
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

  it('shows all visible content when Home is selected', () => {
    renderHomeFolderList();

    expect(screen.getByRole('heading', { level: 2, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('2');
    expect(screen.getByTestId('folder-list-title-root-topic')).toHaveTextContent('Root topic');
    expect(screen.getByTestId('folder-list-title-folder-topic')).toHaveTextContent('Folder topic');
    expect(screen.queryByTestId('folder-list-title-child-topic')).not.toBeInTheDocument();
    expect(screen.queryByTestId('folder-list-title-highlight-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('folder-list-title-review-item')).not.toBeInTheDocument();
    expect(screen.queryByTestId('folder-list-title-deleted-topic')).not.toBeInTheDocument();
  });
});
