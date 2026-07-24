import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createCollectionVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_PUBLISHED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
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

  renderWithLocalization(
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

  expect(screen.getByRole('treeitem', { name: 'Shelved' }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Removed' }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(onOpenVirtualView).toHaveBeenCalledWith(VIRTUAL_PUBLISHED_NODE_ID);
  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Published' }), { key: 'ArrowDown' });
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

  renderWithLocalization(
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

it('does not show a result count on the virtual root', () => {
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

  renderWithLocalization(
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

  expect(screen.getByRole('treeitem', { name: 'Virtual' })).not.toHaveTextContent('3');
  expect(screen.queryByRole('button', { name: 'New saved search' })).toBeNull();
  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Virtual' }), { key: 'ArrowRight' });
  expect(screen.getByRole('treeitem', { name: 'Custom virtual' })).toHaveTextContent('2');
});

it('shows Collection YAML action on a real virtual folder menu', () => {
  const root = createVirtualNode({ id: VIRTUAL_ROOT_NODE_ID, parentNodeId: null, specialKind: 'virtual-root', title: 'Virtual' });
  const custom = createVirtualNode({ id: 'virtual-custom', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Reading queue' });
  useWorkspaceStore.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      'virtual-custom': {
        content: '', createdAt: custom.createdAt, id: custom.id, isTitleManual: true, kind: 'folder',
        parentNodeId: VIRTUAL_ROOT_NODE_ID, reveal: null, review: null, specialKind: 'virtual',
        title: custom.title, updatedAt: custom.updatedAt,
        virtualFilter: createCollectionVirtualNodeFilter(custom.title)
      }
    }
  }));
  renderWithLocalization(
    <WorkspaceVirtualSection
      activeVirtualNodeId="virtual-custom"
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID, 'virtual-custom']}
      nodesById={{ [VIRTUAL_ROOT_NODE_ID]: root, 'virtual-custom': custom }}
      onOpenVirtualView={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
    />
  );

  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Reading queue' }));
  expect(screen.getByText('Write virtual folder info to Topic YAML')).toBeInTheDocument();
});

it('shows a visible message when virtual folder rename fails', async () => {
  useWorkspaceStore.setState({ updateNodeTitle: vi.fn(async () => false) });
  const root = createVirtualNode({ id: VIRTUAL_ROOT_NODE_ID, parentNodeId: null, specialKind: 'virtual-root', title: 'Virtual' });
  const custom = createVirtualNode({ id: 'virtual-custom', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Reading queue' });
  renderWithLocalization(
    <WorkspaceVirtualSection
      activeVirtualNodeId="virtual-custom"
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID, 'virtual-custom']}
      nodesById={{ [VIRTUAL_ROOT_NODE_ID]: root, 'virtual-custom': custom }}
      onOpenVirtualView={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
    />
  );

  fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Reading queue' }));
  const input = screen.getByRole('textbox', { name: 'Rename Reading queue' });
  fireEvent.change(input, { target: { value: 'Duplicate' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(await screen.findByText(/Could not rename this virtual folder/)).toBeInTheDocument();
});

it('can be hidden by the Demo shell without changing non-demo virtual rows', () => {
  const root = createVirtualNode({
    id: VIRTUAL_ROOT_NODE_ID,
    parentNodeId: null,
    specialKind: 'virtual-root',
    title: 'Virtual'
  });

  renderWithLocalization(
    <WorkspaceVirtualSection
      hideInDemo
      activeVirtualNodeId={VIRTUAL_ROOT_NODE_ID}
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID]}
      nodesById={{ [VIRTUAL_ROOT_NODE_ID]: root }}
      onOpenVirtualView={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
    />
  );

  expect(screen.queryByRole('treeitem', { name: 'Virtual' })).toBeNull();
});
