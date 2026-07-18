import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { FolderListView } from './FolderListView';

function createNode(id: string, title: string, kind: Node['kind'] = 'topic'): Node {
  return {
    content: '',
    createdAt: '2026-04-01T09:00:00.000Z',
    id,
    kind,
    parentNodeId: kind === 'folder' ? null : 'folder-1',
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-02T10:30:00.000Z'
  };
}

it('defaults an uncontrolled folder list to its saved manual order', () => {
  const folder = { ...createNode('folder-1', 'Library', 'folder'), manualChildOrder: ['node-b'] };
  const alpha = createNode('node-a', 'Alpha');
  const beta = createNode('node-b', 'Beta');
  const nodesById = { 'folder-1': folder, 'node-a': alpha, 'node-b': beta };

  renderWithLocalization(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', 'node-a', 'node-b']}
      nodesById={nodesById}
      onSelectNode={vi.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Sort list by Custom order' })).toBeInTheDocument();
  expect(
    within(screen.getByRole('list', { name: 'Folder contents' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
  ).toEqual(['Open Beta', 'Open Alpha']);
});
