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

export { createSmokeRuntimeInvoke } from './app-smoke-runtime-mock';

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

vi.mock('../shared/platform/runtimeInvoke', async () => {
  const { createSmokeRuntimeInvoke } = await import('./app-smoke-runtime-mock');
  return {
    isRuntimeInvokeAvailable: vi.fn(() => Boolean(window.electronAPI?.invoke)),
    getRuntimeInvoke: vi.fn(() => window.electronAPI?.invoke ?? createSmokeRuntimeInvoke())
  };
});

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
    libraryScope: 'smoke',
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
