import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentPanelTrashContent } from './DocumentPanelTrashContent';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? '2026-04-01T09:00:00.000Z',
    id: overrides.id,
    kind: overrides.kind ?? 'topic',
    openingText: overrides.openingText ?? null,
    parentNodeId: overrides.parentNodeId === undefined ? null : overrides.parentNodeId,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    title: overrides.title,
    updatedAt: overrides.updatedAt ?? '2026-04-01T09:00:00.000Z',
    ...(overrides.deletedAt !== undefined ? { deletedAt: overrides.deletedAt } : {})
  };
}

function renderTrashContent(options?: {
  sortDirection?: FolderListSortDirection;
  sortKey?: FolderListSortKey;
}) {
  const folder = createNode({
    deletedAt: '2026-04-02T09:00:00.000Z',
    id: 'folder-1',
    kind: 'folder',
    title: 'Deleted folder'
  });
  const olderTopic = createNode({
    content: 'Older body',
    id: 'older-topic',
    parentNodeId: 'folder-1',
    title: 'Older topic'
  });
  const newerTopic = createNode({
    content: 'Newer body',
    id: 'newer-topic',
    parentNodeId: 'folder-1',
    title: 'Newer topic'
  });
  const nodes = [folder, olderTopic, newerTopic];

  renderWithLocalization(
    <DocumentPanelTrashContent
      folderListSortDirection={options?.sortDirection ?? 'desc'}
      folderListSortKey={options?.sortKey ?? 'dateSaved'}
      folderNodeId="folder-1"
      folderTitle="Deleted folder"
      nodeOrder={nodes.map((node) => node.id)}
      nodesById={Object.fromEntries(nodes.map((node) => [node.id, node]))}
      onChangeFolderListSortDirection={() => undefined}
      onChangeFolderListSortKey={() => undefined}
      onSelectTrashNode={vi.fn<(nodeId: string) => void>()}
      pdfCache={<div />}
      trashedNodeIds={['folder-1']}
    />
  );
}

describe('DocumentPanelTrashContent', () => {
  it('shows deleted folder contents when only the folder carries trash membership', () => {
    renderTrashContent();

    expect(screen.getByRole('button', { name: 'Sort list by Deleted time' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('2');
    const newerTitle = screen.getByTestId('folder-list-title-newer-topic');
    const olderTitle = screen.getByTestId('folder-list-title-older-topic');

    expect(newerTitle).toHaveTextContent('Newer topic');
    expect(olderTitle).toHaveTextContent('Older topic');
    expect(newerTitle.compareDocumentPosition(olderTitle)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
