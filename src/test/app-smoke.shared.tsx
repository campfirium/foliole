import { useEffect } from 'react';
import { beforeEach, vi } from 'vitest';

import './reactPdfMock';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import type { Node } from '../features/nodes/model/nodeTypes';
import { resetPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

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
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date(FIXED_TIMESTAMP)));
  mockEditorState.content = '# Welcome to Foliole\n\nStart writing markdown here.';
  mockEditorState.selectionFrom = 0;
  mockEditorState.selectionTo = 0;
}

beforeEach(() => {
  resetAppSmokeState();
});
