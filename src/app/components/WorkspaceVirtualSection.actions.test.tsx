import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { APP_LANGUAGE_STORAGE_KEY } from '../../shared/localization/appLanguage';
import { setSystemEntryDisplayNames } from '../../shared/localization/systemEntryDisplayNamesStore';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import type { ElectronAPI } from '../../shared/platform/electronApi';
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

beforeAll(async () => {
  await preloadTranslationCatalog('zh-Hans');
});

beforeEach(() => {
  window.localStorage.clear();
  setSystemEntryDisplayNames({ customDisplayNameById: {}, version: 1 });
  window.electronAPI = {
    invoke: vi.fn(async (_command: string, args?: { payload?: unknown }) => args?.payload)
  } as unknown as ElectronAPI;
  useWorkspaceStore.setState({
    createVirtualNode: vi.fn(async () => 'virtual-new'),
    deleteNode: vi.fn(),
    updateNodeTitle: vi.fn(async () => true)
  });
});

it('uses the shared localized rename action for a built-in Virtual folder', async () => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');
  renderSavedSearchTree();

  fireEvent.contextMenu(await screen.findByRole('treeitem', { name: '虚拟文件夹' }));

  expect(await screen.findByRole('menuitem', { name: '重命名' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
});

it('renames the built-in Virtual folder through the ordinary row action', async () => {
  renderSavedSearchTree();

  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Virtual folders' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const input = await screen.findByRole('textbox', { name: 'Rename Virtual folders' });
  fireEvent.change(input, { target: { value: 'Smart views' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(await screen.findByRole('treeitem', { name: 'Smart views' })).toBeInTheDocument();
  expect(window.electronAPI?.invoke).toHaveBeenCalledWith('save_system_entry_display_names', {
    payload: { customDisplayNameById: { 'virtual-root': 'Smart views' }, version: 1 }
  });
});

it('marks the virtual root with the layers icon', () => {
  renderSavedSearchTree();

  expect(screen.getByRole('treeitem', { name: 'Virtual folders' }).querySelector('.lucide-layers-2')).toBeInTheDocument();
});

it('creates a manual virtual folder from the Virtual root context menu', async () => {
  const onOpenVirtualView = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();
  renderSavedSearchTree({ onOpenVirtualView, onSelectNodeInVirtualView });

  expect(screen.queryByRole('button', { name: 'Create Virtual Folder' })).toBeNull();
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Virtual folders' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Virtual Folder' }));

  await waitFor(() => expect(useWorkspaceStore.getState().createVirtualNode).toHaveBeenCalledWith({ mode: 'manual' }));
  expect(onOpenVirtualView).toHaveBeenCalledWith('virtual-new');
  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('virtual-new');
});

it('creates a child virtual folder from the virtual folder context menu', async () => {
  renderSavedSearchTree();

  expect(screen.queryByRole('button', { name: 'Create Virtual Folder' })).toBeNull();
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Custom virtual' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Virtual Folder' }));

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
