import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

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

function DefaultFolderListSelectionHarness(props: { onSelectNode?: (nodeId: string) => void }) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const folderNode = createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' });
  const first = createNode({ id: 'node-1', parentNodeId: 'folder-1', title: 'First topic' });
  const second = createNode({ id: 'node-2', parentNodeId: 'folder-1', title: 'Second topic' });
  const third = createNode({ id: 'node-3', parentNodeId: 'folder-1', title: 'Third topic' });
  const nodesById = Object.fromEntries([folderNode, first, second, third].map((node) => [node.id, node]));
  const handleSelectNode = (nodeId: string) => {
    setActiveNodeId(nodeId);
    props.onSelectNode?.(nodeId);
  };

  return (
    <FolderListView
      activeNodeId={activeNodeId}
      nodes={[first, second, third]}
      nodesById={nodesById}
      onSelectNode={handleSelectNode}
    />
  );
}

it('keeps the original anchor when shift-selecting default cards', () => {
  const onSelectNode = vi.fn();
  renderWithLocalization(<DefaultFolderListSelectionHarness onSelectNode={onSelectNode} />);

  fireEvent.click(screen.getByRole('button', { name: 'Open First topic' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open Third topic' }), { shiftKey: true });

  expect(screen.getByRole('button', { name: 'Open First topic' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('button', { name: 'Open Second topic' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('button', { name: 'Open Third topic' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(onSelectNode).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Open Second topic' }), { shiftKey: true });

  expect(screen.getByRole('button', { name: 'Open First topic' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('button', { name: 'Open Second topic' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('button', { name: 'Open Third topic' })).not.toHaveAttribute('data-node-bulk-selected');
  expect(onSelectNode).toHaveBeenCalledTimes(1);
});

it('keeps range selection when shift-clicking virtual result location text', () => {
  const onSelectNode = vi.fn();
  const onSelectNodePath = vi.fn();
  const first = createNode({ id: 'first', title: 'First topic' });
  const second = createNode({ id: 'second', title: 'Second topic' });
  const third = createNode({ id: 'third', title: 'Third topic' });
  const nodesById = { first, second, third };

  renderWithLocalization(
    <FolderListView
      itemLayout="virtual-result"
      nodes={[first, second, third]}
      nodesById={nodesById}
      onSelectNode={onSelectNode}
      onSelectNodePath={onSelectNodePath}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open First topic' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open real location for Third topic' }), { shiftKey: true });

  expect(screen.getByRole('button', { name: 'Open First topic' }).closest('li')).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('button', { name: 'Open Second topic' }).closest('li')).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('button', { name: 'Open Third topic' }).closest('li')).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(onSelectNode).toHaveBeenCalledTimes(1);
  expect(onSelectNodePath).not.toHaveBeenCalled();
});
