import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
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

function renderSavedSearchTree(args: {
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNodeInVirtualView?: (nodeId: string) => void;
} = {}) {
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
      activeVirtualNodeId="virtual-custom"
      isVirtualViewOpen
      nodeOrder={[VIRTUAL_ROOT_NODE_ID, 'virtual-custom']}
      nodesById={{
        [VIRTUAL_ROOT_NODE_ID]: root,
        'virtual-custom': custom
      }}
      onOpenVirtualView={args.onOpenVirtualView ?? vi.fn()}
      onSelectNodeInVirtualView={args.onSelectNodeInVirtualView ?? vi.fn()}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState({
    createVirtualNode: vi.fn(async () => 'virtual-new'),
    deleteNode: vi.fn(),
    updateNodeTitle: vi.fn(async () => true)
  });
});

it('marks the virtual root with the layers icon', () => {
  renderSavedSearchTree();

  expect(screen.getByRole('treeitem', { name: 'Virtual' }).querySelector('.lucide-layers-2')).toBeInTheDocument();
});

it('creates a manual virtual folder from the Virtual root action', async () => {
  const onOpenVirtualView = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();
  renderSavedSearchTree({ onOpenVirtualView, onSelectNodeInVirtualView });

  fireEvent.click(screen.getByRole('button', { name: 'Create Virtual Folder' }));

  await waitFor(() => expect(useWorkspaceStore.getState().createVirtualNode).toHaveBeenCalledWith({ mode: 'manual' }));
  expect(onOpenVirtualView).toHaveBeenCalledWith('virtual-new');
  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('virtual-new');
});

it('creates a child virtual folder from a virtual folder row action', async () => {
  renderSavedSearchTree();

  fireEvent.click(screen.getByRole('button', { name: 'Create Virtual Folder in Custom virtual' }));

  await waitFor(() => expect(useWorkspaceStore.getState().createVirtualNode).toHaveBeenCalledWith({
    mode: 'manual',
    parentNodeId: 'virtual-custom'
  }));
});

it('renames a saved search from the virtual directory row', async () => {
  renderSavedSearchTree();

  expect(screen.queryByRole('button', { name: 'Saved search actions' })).toBeNull();
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Custom virtual' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const renameInput = await screen.findByRole('textbox', { name: 'Rename Custom virtual' });
  fireEvent.change(renameInput, { target: { value: 'Saved AI topics' } });
  fireEvent.keyDown(renameInput, { key: 'Enter' });

  expect(useWorkspaceStore.getState().updateNodeTitle).toHaveBeenCalledWith('virtual-custom', 'Saved AI topics');
});

it('deletes only saved searches from the virtual directory row actions', async () => {
  renderSavedSearchTree();

  expect(screen.queryByRole('button', { name: 'Saved search actions' })).toBeNull();
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Custom virtual' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

  expect(useWorkspaceStore.getState().deleteNode).toHaveBeenCalledWith('virtual-custom');
});
