import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceVirtualSection } from './WorkspaceVirtualSection';

function createVirtualNode(args: {
  id: string;
  parentNodeId: string | null;
  specialKind: NonNullable<WorkspaceListNode['specialKind']>;
  title: string;
}): WorkspaceListNode {
  return {
    createdAt: '2026-05-01T00:00:00.000Z',
    hasContent: false,
    hasReveal: false,
    id: args.id,
    kind: 'folder',
    parentNodeId: args.parentNodeId,
    review: null,
    specialKind: args.specialKind,
    title: args.title,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState({
    createVirtualNode: vi.fn(async () => 'virtual-new'),
    deleteNode: vi.fn(),
    updateNodeTitle: vi.fn(async () => true)
  });
});

it('moves from the virtual root through built-in virtual rows with arrow keys', () => {
  const onOpenVirtualView = vi.fn();
  const root = createVirtualNode({
    id: VIRTUAL_ROOT_NODE_ID,
    parentNodeId: null,
    specialKind: 'virtual-root',
    title: 'Virtual'
  });
  const custom = createVirtualNode({
    id: 'virtual-custom',
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    specialKind: 'virtual',
    title: 'Custom virtual'
  });

  render(
    <WorkspaceVirtualSection
      activeVirtualNodeId={VIRTUAL_ROOT_NODE_ID}
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID, 'virtual-custom']}
      nodesById={{
        [VIRTUAL_ROOT_NODE_ID]: root,
        'virtual-custom': custom
      }}
      onOpenVirtualView={onOpenVirtualView}
      onSelectNodeInVirtualView={vi.fn()}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Virtual' }), { key: 'ArrowRight' });
  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Virtual' }), { key: 'ArrowDown' });

  expect(onOpenVirtualView).toHaveBeenCalledWith(VIRTUAL_SHELVED_NODE_ID);
  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Shelved' }), { key: 'ArrowDown' });
  expect(onOpenVirtualView).toHaveBeenCalledWith(VIRTUAL_REMOVED_NODE_ID);
});

it('hides the Removed row when the virtual root is collapsed', () => {
  const root = createVirtualNode({
    id: VIRTUAL_ROOT_NODE_ID,
    parentNodeId: null,
    specialKind: 'virtual-root',
    title: 'Virtual'
  });
  const custom = createVirtualNode({
    id: 'virtual-custom',
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    specialKind: 'virtual',
    title: 'Custom virtual'
  });

  render(
    <WorkspaceVirtualSection
      activeVirtualNodeId={VIRTUAL_ROOT_NODE_ID}
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID, 'virtual-custom']}
      nodesById={{
        [VIRTUAL_ROOT_NODE_ID]: root,
        'virtual-custom': custom
      }}
      onOpenVirtualView={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
    />
  );

  expect(screen.getByRole('treeitem', { name: 'Shelved' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Removed' })).toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Virtual' }), { key: 'ArrowLeft' });

  expect(screen.queryByRole('treeitem', { name: 'Shelved' })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: 'Removed' })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: 'Custom virtual' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Virtual' })).toHaveAttribute('aria-expanded', 'false');
});

it('shows virtual result counts without counting virtual child folders', () => {
  const root = createVirtualNode({
    id: VIRTUAL_ROOT_NODE_ID,
    parentNodeId: null,
    specialKind: 'virtual-root',
    title: 'Virtual'
  });
  const custom = createVirtualNode({
    id: 'virtual-custom',
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    specialKind: 'virtual',
    title: 'Custom virtual'
  });

  render(
    <WorkspaceVirtualSection
      activeVirtualNodeId={VIRTUAL_ROOT_NODE_ID}
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID, 'virtual-custom']}
      nodesById={{
        [VIRTUAL_ROOT_NODE_ID]: root,
        'virtual-custom': custom
      }}
      virtualResultCountById={new Map([
        [VIRTUAL_ROOT_NODE_ID, 3],
        ['virtual-custom', 2]
      ])}
      onOpenVirtualView={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
    />
  );

  expect(screen.getByRole('treeitem', { name: 'Virtual' })).toHaveTextContent('3');
  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Virtual' }), { key: 'ArrowRight' });
  expect(screen.getByRole('treeitem', { name: 'Custom virtual' })).toHaveTextContent('2');
});

it('creates and opens a saved search from the virtual root action', async () => {
  const onOpenVirtualView = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();
  const root = createVirtualNode({
    id: VIRTUAL_ROOT_NODE_ID,
    parentNodeId: null,
    specialKind: 'virtual-root',
    title: 'Virtual'
  });

  render(
    <WorkspaceVirtualSection
      activeVirtualNodeId={VIRTUAL_ROOT_NODE_ID}
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID]}
      nodesById={{ [VIRTUAL_ROOT_NODE_ID]: root }}
      onOpenVirtualView={onOpenVirtualView}
      onSelectNodeInVirtualView={onSelectNodeInVirtualView}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'New saved search' }));

  expect(useWorkspaceStore.getState().createVirtualNode).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onOpenVirtualView).toHaveBeenCalledWith('virtual-new'));
  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('virtual-new');
});
