import { useEffect } from 'react';
import { beforeEach, vi } from 'vitest';

import './reactPdfMock';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import type { Node } from '../features/nodes/model/nodeTypes';
import { resetPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { resetWorkspaceNodeDocumentPrefetchForTest } from '../store/workspaceNodeDocumentPrefetch';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

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

export const loadRuntimeNodeBacklinksMock = smokeBridgeMocks.loadRuntimeNodeBacklinks;
export const loadRuntimePdfImportsInventoryMock = smokeBridgeMocks.loadRuntimePdfImportsInventory;
export const loadRuntimeReadwiseBooksInventoryMock = smokeBridgeMocks.loadRuntimeReadwiseBooksInventory;
export const useNodeSourceDetailsMock = smokeBridgeMocks.useNodeSourceDetails;
export const useNodeSourceUpdatePreviewMock = smokeBridgeMocks.useNodeSourceUpdatePreview;

export const mockEditorState: { content: string; selectionFrom: number; selectionTo: number } = {
  content: '',
  selectionFrom: 0,
  selectionTo: 0
};

export const mockEditorAdapter: EditorAdapter = {
  destroy: () => undefined,
  focus: () => undefined,
  getContent: () => mockEditorState.content,
  getDocumentPositionAtViewportY: () => 0,
  setContent: (content: string) => {
    mockEditorState.content = content;
  },
  getSelection: () => ({ from: mockEditorState.selectionFrom, to: mockEditorState.selectionTo }),
  getSelectionRanges: () => [{ from: mockEditorState.selectionFrom, to: mockEditorState.selectionTo }],
  getLineBlockHeight: () => 24,
  revealPosition: (position) => {
    mockEditorState.selectionFrom = position;
    mockEditorState.selectionTo = position;
  },
  restoreSelection: (selection) => {
    mockEditorState.selectionFrom = selection.from;
    mockEditorState.selectionTo = selection.to;
  },
  revealSelection: (selection) => {
    mockEditorState.selectionFrom = selection.from;
    mockEditorState.selectionTo = selection.to;
  },
  setSelection: (selection) => {
    mockEditorState.selectionFrom = selection.from;
    mockEditorState.selectionTo = selection.to;
  },
  setSelectionRanges: (selections) => {
    const selection = selections.at(-1) ?? { from: 0, to: 0 };
    mockEditorState.selectionFrom = selection.from;
    mockEditorState.selectionTo = selection.to;
  },
  getScrollTop: () => 0,
  setScrollTop: () => undefined,
  getScrollMetrics: () => ({ clientHeight: 1, scrollHeight: 1, scrollTop: 0 }),
  replaceRange: (from: number, to: number, content: string) => {
    mockEditorState.content = `${mockEditorState.content.slice(0, from)}${content}${mockEditorState.content.slice(to)}`;
    const nextCursor = from + content.length;
    mockEditorState.selectionFrom = nextCursor;
    mockEditorState.selectionTo = nextCursor;
  },
  replaceSelection: (content: string) => {
    const from = Math.min(mockEditorState.selectionFrom, mockEditorState.selectionTo);
    const to = Math.max(mockEditorState.selectionFrom, mockEditorState.selectionTo);
    mockEditorState.content = `${mockEditorState.content.slice(0, from)}${content}${mockEditorState.content.slice(to)}`;
    const nextCursor = from + content.length;
    mockEditorState.selectionFrom = nextCursor;
    mockEditorState.selectionTo = nextCursor;
  },
  setDiffDecorations: () => undefined,
  setSearchDecorations: () => undefined,
  onContentChange: () => () => undefined,
  onScroll: () => () => undefined
};

vi.mock('../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: ({
    ariaLabel,
    value,
    onChange,
    onImageLoadStateChange,
    onReady
  }: {
    ariaLabel?: string;
    value: string;
    onChange: (value: string) => void;
    onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
    onReady?: (adapter: EditorAdapter | null) => void;
  }) => {
    mockEditorState.content = value;
    useEffect(() => {
      onImageLoadStateChange?.({ loadedCount: 0, totalCount: 0 });
      onReady?.(mockEditorAdapter);
      return () => onReady?.(null);
    }, [onImageLoadStateChange, onReady]);
    return (
      <textarea
        aria-label={ariaLabel ?? 'Mock editor'}
        data-testid={ariaLabel === 'Answer editor' ? 'answer-editor-value' : 'editor-value'}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          mockEditorState.content = nextValue;
          onChange(nextValue);
        }}
        value={value}
      />
    );
  }
}));

vi.mock('../app/components/ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));

vi.mock('../app/components/WorkspaceSettingsOverlay', () => ({
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
    kind: partial.kind ?? (partial.specialKind === 'inbox' ? 'folder' : partial.reveal !== null ? 'item' : 'topic'),
    priority: partial.priority ?? null,
    desiredRetention: partial.desiredRetention ?? null,
    specialKind: partial.specialKind,
    title: partial.title,
    content: partial.content,
    reveal: partial.reveal ?? null,
    reading: partial.reading ?? null,
    review: partial.review ?? null,
    anchorLink: partial.anchorLink,
    createdAt: partial.createdAt ?? FIXED_TIMESTAMP,
    updatedAt: partial.updatedAt ?? FIXED_TIMESTAMP
  };
}

export function resetAppSmokeState() {
  window.history.pushState({}, '', '/');
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
        title: 'Welcome to Foliole',
        content: '# Welcome to Foliole\n\nStart writing markdown here.'
      })
    }
  });
  mockEditorState.content = '# Welcome to Foliole\n\nStart writing markdown here.';
  mockEditorState.selectionFrom = 0;
  mockEditorState.selectionTo = 0;
}

beforeEach(() => {
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
