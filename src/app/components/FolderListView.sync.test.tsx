import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    id: overrides.id,
    parentNodeId: overrides.parentNodeId === undefined ? 'folder-1' : overrides.parentNodeId,
    kind: overrides.kind ?? 'topic',
    title: overrides.title,
    content: '',
    openingText: null,
    reveal: null,
    review: null,
    createdAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-04-02T10:30:00.000Z'
  };
}

it('keeps folder contents aligned with created, moved, and trashed nodes', () => {
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const otherFolderNode = createNode({ id: 'folder-2', kind: 'folder', parentNodeId: null, title: 'Archive' });
  const staleNode = createNode({ id: 'node-1', title: 'Deleted topic' });
  const movedNode = createNode({ id: 'node-2', parentNodeId: 'folder-2', title: 'Moved topic' });
  const createdNode = createNode({ id: 'node-3', title: 'New topic' });
  const nodesById = Object.fromEntries(
    [folderNode, otherFolderNode, staleNode, movedNode, createdNode].map((node) => [node.id, node])
  );

  renderWithLocalization(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', 'folder-2', 'node-1', 'node-2', 'node-3']}
      nodeViewById={{}}
      nodesById={nodesById}
      onSelectNode={() => undefined}
      trashedNodeIds={['node-1']}
    />
  );

  expect(screen.queryByRole('button', { name: 'Open Deleted topic' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Moved topic' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open New topic' })).toBeInTheDocument();
});
