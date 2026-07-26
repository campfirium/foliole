import { screen, within } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

import './app-smoke-desktop-update-mock';
import './reactPdfMock';

import type { Node } from '../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { definedProps } from '../shared/lib/definedProps';
import { resetPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { resetWorkspaceNodeDocumentPrefetchForTest } from '../store/workspaceNodeDocumentPrefetch';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

import { mockEditorState } from './app-smoke-editor-mock';

export { mockEditorState } from './app-smoke-editor-mock';

const smokeRuntimeMocks = vi.hoisted(() => {
  function createNodeMutationResult(command: string, payload?: Record<string, unknown>) {
    if (Array.isArray(payload?.nodeOrder)) {
      return null;
    }
    const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : 'node-created';
    const parentNodeId = typeof payload?.parentNodeId === 'string' ? payload.parentNodeId : null;
    const content = typeof payload?.content === 'string' ? payload.content : '';
    const reveal = typeof payload?.reveal === 'string' ? payload.reveal : null;
    const kind =
      typeof payload?.kind === 'string'
        ? payload.kind
        : command === 'create_folder'
          ? 'folder'
          : command === 'create_item'
            ? 'item'
            : 'topic';
    return {
      activeNodeId: typeof payload?.activeNodeId === 'string' ? payload.activeNodeId : nodeId,
      createdNodeIds: [nodeId],
      nodeOrder: Array.isArray(payload?.nodeOrder) ? payload.nodeOrder : [nodeId],
      nodes: [{
        nodeId, parentNodeId, kind,
        title: typeof payload?.title === 'string' ? payload.title : '',
        content, hasContent: typeof payload?.hasContent === 'boolean' ? payload.hasContent : content.trim().length > 0,
        reveal, hasReveal: typeof payload?.hasReveal === 'boolean' ? payload.hasReveal : reveal != null,
        anchorLink: null, reading: null, review: null,
        createdAt: '2026-02-25T00:00:00.000Z', updatedAt: '2026-02-25T00:00:00.000Z'
      }]
    };
  }
  return {
  createRuntimeInvoke: () => vi.fn(async (command: string, payload?: Record<string, unknown>) => {
    if (command === 'create_folder' || command === 'create_topic' || command === 'create_item') {
      return createNodeMutationResult(command, payload);
    }
    if (command === 'update_node_content' || command === 'update_node_reveal') {
      return { nodes: payload ? [payload] : [], updatedNodeIds: typeof payload?.nodeId === 'string' ? [payload.nodeId] : [] };
    }
    if (command === 'update_node_content_with_anchors') {
      return {
        anchorUpdates: Array.isArray(payload?.affectedAnchors) ? payload.affectedAnchors : [],
        nodes: payload?.parent ? [payload.parent] : []
      };
    }
    if (command === 'soft_delete_nodes') return { deletedNodeIds: Array.isArray(payload?.nodeIds) ? payload.nodeIds : [] };
    if (command === 'restore_nodes') return { restoredNodeIds: Array.isArray(payload?.nodeIds) ? payload.nodeIds : [], skippedConflicts: [] };
    if (command === 'delete_nodes_permanently') {
      const nodeOrder = Array.isArray(payload?.nodeOrder) ? payload.nodeOrder : [];
      const nodeIds = Array.isArray(payload?.nodeIds) ? payload.nodeIds : [];
      return { nodeOrder: nodeOrder.filter((nodeId) => !nodeIds.includes(nodeId)), removedNodeIds: nodeIds };
    }
    if (command === 'move_nodes') return { movedNodeIds: Array.isArray(payload?.nodeIds) ? payload.nodeIds : [], nodeOrder: payload?.nodeOrder };
    if (command === 'inspect_foliole_published_delete') return { status: 'allowed' };
    if (command === 'load_node_backlinks') return [];
    if (command === 'load_readwise_books_inventory') return { books: [] };
    return null;
  })
  };
});

export function createSmokeRuntimeInvoke() {
  return smokeRuntimeMocks.createRuntimeInvoke();
}

const smokeBridgeMocks = vi.hoisted(() => ({
  loadRuntimePdfImportsInventory: vi.fn(async () => ({ items: [] })),
  loadRuntimeReadwiseBooksInventory: vi.fn(async () => ({ books: [] })),
  loadRuntimeNodeBacklinks: vi.fn(async () => null),
  useNodeSourceDetails: vi.fn(() => ({
    isLoading: false,
    value: null
  })),
  useNodeSourceUpdatePreview: vi.fn(() => ({
    isLoading: false,
    value: null
  }))
}));

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => window.electronAPI?.invoke ?? smokeRuntimeMocks.createRuntimeInvoke())
}));

export const loadRuntimeNodeBacklinksMock = smokeBridgeMocks.loadRuntimeNodeBacklinks;
export const loadRuntimePdfImportsInventoryMock = smokeBridgeMocks.loadRuntimePdfImportsInventory;
export const loadRuntimeReadwiseBooksInventoryMock = smokeBridgeMocks.loadRuntimeReadwiseBooksInventory;
export const useNodeSourceDetailsMock = smokeBridgeMocks.useNodeSourceDetails;
export const useNodeSourceUpdatePreviewMock = smokeBridgeMocks.useNodeSourceUpdatePreview;

vi.mock('../features/editor/components/MarkdownEditor', () => import('./app-smoke-editor-mock'));

vi.mock('../app/components/ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));

vi.mock('../app/components/WorkspaceSettingsOverlay', () => ({
  prewarmWorkspaceSettingsOverlay: vi.fn(() => Promise.resolve()),
  selectWorkspaceSettingsOverlayProps: (props: {
    isSettingsOpen: boolean;
    onCloseSettings: () => void;
    requestedSettingsCategory: unknown;
  }) => ({
    isSettingsOpen: props.isSettingsOpen,
    onClose: props.onCloseSettings,
    requestedCategory: props.requestedSettingsCategory
  }),
  WorkspaceSettingsOverlay: () => null
}));

vi.mock('../app/components/useNodeSourceDetails', () => ({
  useNodeSourceDetails: smokeBridgeMocks.useNodeSourceDetails
}));

vi.mock('../app/components/useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: smokeBridgeMocks.useNodeSourceUpdatePreview
}));

vi.mock('../shared/platform/nodeBacklinksBridge', () => ({
  loadRuntimeNodeBacklinks: smokeBridgeMocks.loadRuntimeNodeBacklinks
}));

vi.mock('../shared/platform/pdfImportsBridge', () => ({
  loadRuntimePdfImportsInventory: smokeBridgeMocks.loadRuntimePdfImportsInventory
}));

vi.mock('../shared/platform/readwiseBooksBridge', async () => {
  const actual = await vi.importActual<typeof import('../shared/platform/readwiseBooksBridge')>(
    '../shared/platform/readwiseBooksBridge'
  );
  return {
    ...actual,
    loadRuntimeReadwiseBooksInventory: smokeBridgeMocks.loadRuntimeReadwiseBooksInventory
  };
});

export const FIXED_TIMESTAMP = '2026-02-25T00:00:00.000Z';

export function createNode(partial: Partial<Node> & Pick<Node, 'id' | 'title' | 'content'>): Node {
  return {
    id: partial.id,
    parentNodeId: partial.parentNodeId ?? null,
    kind: partial.kind ?? (partial.specialKind === 'inbox' ? 'folder' : partial.reveal != null ? 'item' : 'topic'),
    priority: partial.priority ?? null,
    desiredRetention: partial.desiredRetention ?? null,
    title: partial.title,
    content: partial.content,
    hasContent: partial.hasContent ?? partial.content.trim().length > 0,
    reveal: partial.reveal ?? null,
    hasReveal: partial.hasReveal ?? partial.reveal != null,
    reading: partial.reading ?? null,
    review: partial.review ?? null,
    ...definedProps({
      anchorLink: partial.anchorLink,
      specialKind: partial.specialKind
    }),
    createdAt: partial.createdAt ?? FIXED_TIMESTAMP,
    updatedAt: partial.updatedAt ?? FIXED_TIMESTAMP
  };
}

export function resetAppSmokeState() {
  window.history.pushState({}, '', '/');
  delete window.electronAPI;
  localStorage.clear();
  resetPerformanceDiagnosticsProbe();
  resetWorkspaceNodeDocumentPrefetchForTest();
  const initial = createInitialWorkspaceState(new Date(FIXED_TIMESTAMP));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    isHydrated: true,
    nodeOrder: [...initial.nodeOrder, 'node-1'],
    nodesById: {
      ...initial.nodesById,
      'node-1': createNode({
        id: 'node-1',
        parentNodeId: INBOX_NODE_ID,
        title: 'Welcome to Foliole',
        content: '# Welcome to Foliole\n\nStart writing markdown here.'
      })
    }
  });
  mockEditorState.content = '# Welcome to Foliole\n\nStart writing markdown here.';
  mockEditorState.selectionFrom = 0;
  mockEditorState.selectionTo = 0;
}

export function getTopicListPanel() {
  return screen.getByRole('complementary', { name: 'Topic list panel' });
}

export function getCurrentFolderPanel() {
  return screen.getByRole('complementary', { name: 'Current folder contents' });
}

export function getCurrentFolderTreeItem(name: string | RegExp) {
  return within(getCurrentFolderPanel()).getByRole('treeitem', { name });
}

export function queryCurrentFolderTreeItem(name: string | RegExp) {
  return within(getCurrentFolderPanel()).queryByRole('treeitem', { name });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    disconnect() {}
    observe() {}
    unobserve() {}
  });
  loadRuntimeNodeBacklinksMock.mockReset();
  loadRuntimeNodeBacklinksMock.mockResolvedValue(null);
  loadRuntimePdfImportsInventoryMock.mockReset();
  loadRuntimePdfImportsInventoryMock.mockResolvedValue({ items: [] });
  loadRuntimeReadwiseBooksInventoryMock.mockReset();
  loadRuntimeReadwiseBooksInventoryMock.mockResolvedValue({ books: [] });
  useNodeSourceDetailsMock.mockReset();
  useNodeSourceDetailsMock.mockReturnValue({
    isLoading: false,
    value: null
  });
  useNodeSourceUpdatePreviewMock.mockReset();
  useNodeSourceUpdatePreviewMock.mockReturnValue({
    isLoading: false,
    value: null
  });
  resetAppSmokeState();
});
