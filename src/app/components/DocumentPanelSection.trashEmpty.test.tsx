import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  baseNode,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

it('shows the trash directory list when the trash view has no selected topic', () => {
  const onSelectTrashNode = vi.fn();

  renderSectionWithProps({
    activeNodeId: null,
    editorNodeId: null,
    isTrashViewOpen: true,
    isWorkspaceHydrated: true,
    nodeOrder: ['folder', 'topic'],
    nodesById: {
      folder: { ...baseNode, id: 'folder', kind: 'folder', title: 'Deleted folder' },
      topic: { ...baseNode, id: 'topic', parentNodeId: 'folder', title: 'Deleted topic' }
    },
    onSelectTrashNode,
    trashedNodeIds: ['folder', 'topic']
  });

  const trashList = screen.getByRole('region', { name: 'Trash folder list' });
  expect(within(trashList).getByRole('button', { name: 'Open Deleted folder' })).toBeInTheDocument();
  expect(within(trashList).queryByRole('button', { name: 'Open Deleted topic' })).toBeNull();

  fireEvent.click(within(trashList).getByRole('button', { name: 'Open Deleted folder' }));
  expect(onSelectTrashNode).toHaveBeenCalledWith('folder');
});

it('shows a deleted folder directory list inside the trash view', () => {
  renderSectionWithProps({
    activeNodeId: 'folder',
    editorNodeId: 'folder',
    editorContent: 'Folder prose should stay hidden',
    isTrashViewOpen: true,
    isWorkspaceHydrated: true,
    nodeOrder: ['folder', 'topic'],
    nodesById: {
      folder: { ...baseNode, id: 'folder', kind: 'folder', title: 'Deleted folder' },
      topic: { ...baseNode, id: 'topic', parentNodeId: 'folder', title: 'Deleted topic' }
    },
    onSelectTrashNode: vi.fn(),
    trashedNodeIds: ['folder', 'topic']
  });

  const trashList = screen.getByRole('region', { name: 'Trash folder list' });
  expect(within(trashList).getByRole('button', { name: 'Open Deleted topic' })).toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).toBeNull();
});

it('offers permanent delete for the current trash directory list', () => {
  const deleteNodesPermanently = vi.fn();
  useWorkspaceStore.setState((state) => ({ ...state, deleteNodesPermanently }));

  renderSectionWithProps({
    activeNodeId: null,
    editorNodeId: null,
    isTrashViewOpen: true,
    isWorkspaceHydrated: true,
    nodeOrder: ['folder', 'topic'],
    nodesById: {
      folder: { ...baseNode, id: 'folder', kind: 'folder', title: 'Deleted folder' },
      topic: { ...baseNode, id: 'topic', parentNodeId: 'folder', title: 'Deleted topic' }
    },
    onSelectTrashNode: vi.fn(),
    trashedNodeIds: ['folder', 'topic']
  });

  fireEvent.keyDown(screen.getByRole('button', { name: 'Current trash view actions' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently...' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

  expect(deleteNodesPermanently).toHaveBeenCalledWith(['folder']);
});

it('shows a Trash breadcrumb and Restore action for a selected deleted topic', async () => {
  const restoreNode = vi.fn();
  const onSelectNode = vi.fn();
  useWorkspaceStore.setState((state) => ({ ...state, restoreNode }));

  renderSectionWithProps({
    activeNodeId: 'topic',
    editorNodeId: 'topic',
    editorContent: '# Deleted topic',
    isEditorReadOnly: true,
    isTrashViewOpen: true,
    isWorkspaceHydrated: true,
    nodeOrder: ['folder', 'topic'],
    nodesById: {
      folder: { ...baseNode, id: 'folder', kind: 'folder', title: 'Original folder' },
      topic: { ...baseNode, id: 'topic', parentNodeId: 'folder', title: 'Deleted topic' }
    },
    onSelectNode,
    trashedNodeIds: ['topic']
  });

  expect(screen.getByRole('button', { name: 'Trash' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Original folder' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  expect(restoreNode).toHaveBeenCalledWith('topic');
  await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith('topic'));
});
