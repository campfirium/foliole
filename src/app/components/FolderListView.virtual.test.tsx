import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? '2026-04-01T09:00:00.000Z',
    id: overrides.id,
    kind: overrides.kind ?? 'topic',
    openingText: overrides.openingText ?? null,
    parentNodeId: overrides.parentNodeId === undefined ? 'folder-1' : overrides.parentNodeId,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    title: overrides.title,
    updatedAt: overrides.updatedAt ?? '2026-04-02T10:30:00.000Z'
  };
}

it('virtualizes dense folder contents instead of mounting every row', () => {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const children = Array.from({ length: 160 }, (_, index) =>
    createNode({
      id: `node-${String(index).padStart(3, '0')}`,
      title: `Child topic ${String(index).padStart(3, '0')}`
    })
  );
  const nodesById = Object.fromEntries([folderNode, ...children].map((node) => [node.id, node]));

  renderWithLocalization(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', ...children.map((node) => node.id)]}
      nodesById={nodesById}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByTestId('folder-list-count')).toHaveTextContent('160');
  expect(screen.queryAllByTestId(/folder-list-title-node-/).length).toBeLessThan(160);
  expect(screen.getByRole('button', { name: 'Open Child topic 000' }).closest('li')).toHaveClass('list-none');
});
