import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../model/workspaceListNode';

import { NodeListTree } from './NodeListTree';

function createNode(id: string): WorkspaceListNode {
  return {
    createdAt: '2026-05-29T00:00:00.000Z',
    hasContent: false,
    hasReveal: false,
    id,
    kind: 'folder',
    parentNodeId: null,
    reading: null,
    review: null,
    title: id,
    updatedAt: '2026-05-29T00:00:00.000Z'
  };
}

beforeEach(() => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('renders every row immediately when virtualization is disabled', () => {
  const nodeOrder = Array.from({ length: 120 }, (_, index) => `folder-${index}`);
  const nodesById = Object.fromEntries(nodeOrder.map((nodeId) => [nodeId, createNode(nodeId)])) as WorkspaceListNodesById;

  const { container } = renderWithLocalization(
    <NodeListTree
      activeNodeId={null}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      virtualizeRows={false}
    />
  );

  expect(screen.getByRole('treeitem', { name: 'folder-119' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'folder-119' }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(container.querySelector('[data-virtual-list="true"]')).toBeNull();
});
