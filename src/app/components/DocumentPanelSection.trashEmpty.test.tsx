import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

const sourceDetailsMocks = vi.hoisted(() => ({
  importExternalDocument: vi.fn(),
  refreshWorkspaceState: vi.fn()
}));

vi.mock('../../shared/platform/externalDocumentImportRepository', () => ({
  importExternalDocument: sourceDetailsMocks.importExternalDocument
}));

vi.mock('../../store/workspaceRefreshScheduler', () => ({
  refreshWorkspaceState: sourceDetailsMocks.refreshWorkspaceState
}));

import {
  baseNode,
  loadRuntimeNodeSourceDetails,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

function createSourceDetails(sourceLocator: string) {
  return {
    importRuns: [],
    importSource: {
      firstImportedAt: '2026-04-02T09:00:00.000Z',
      lastContentFingerprint: 'fingerprint-1',
      lastImportedAt: '2026-04-02T09:00:00.000Z',
      latestNodeId: 'topic',
      provider: 'desktop_text_file',
      sourceFingerprint: 'source-fingerprint-1',
      sourceKind: 'markdown',
      sourceLocator,
      sourceName: 'Deleted topic.md'
    },
    inheritedFromParent: false,
    keepImportItem: null,
    pdfPageDimensions: [],
    sourceNodeId: 'topic'
  };
}

beforeEach(() => {
  sourceDetailsMocks.importExternalDocument.mockReset();
  loadRuntimeNodeSourceDetails.mockReset();
  sourceDetailsMocks.refreshWorkspaceState.mockReset();
  sourceDetailsMocks.importExternalDocument.mockResolvedValue(null);
  loadRuntimeNodeSourceDetails.mockResolvedValue(null);
  sourceDetailsMocks.refreshWorkspaceState.mockResolvedValue(undefined);
});

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

it('shows a Trash breadcrumb and Import action for a selected deleted source topic', async () => {
  const restoreNode = vi.fn();
  const onSelectNode = vi.fn();
  useWorkspaceStore.setState((state) => ({ ...state, restoreNode }));
  loadRuntimeNodeSourceDetails.mockResolvedValue(createSourceDetails('/library/deleted-topic.md'));
  sourceDetailsMocks.importExternalDocument.mockResolvedValue({
    imported_at: '2026-04-02T09:30:00.000Z',
    node_id: 'imported-topic',
    source_name: 'Deleted topic.md'
  });
  sourceDetailsMocks.refreshWorkspaceState.mockResolvedValue(undefined);

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
  expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();

  fireEvent.click(await screen.findByRole('button', { name: 'Import to Foliole' }));

  await waitFor(() => expect(sourceDetailsMocks.importExternalDocument).toHaveBeenCalledWith('/library/deleted-topic.md'));
  expect(sourceDetailsMocks.refreshWorkspaceState).toHaveBeenCalledWith('external-document-import');
  expect(onSelectNode).toHaveBeenCalledWith('imported-topic');
  expect(restoreNode).not.toHaveBeenCalled();
});
