import { useEffect, useLayoutEffect, useRef } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';

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
  setContent: (content) => {
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
    if (!selection) return;
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
  replaceRange: (from, to, content) => {
    mockEditorState.content = `${mockEditorState.content.slice(0, from)}${content}${mockEditorState.content.slice(to)}`;
    const nextCursor = from + content.length;
    mockEditorState.selectionFrom = nextCursor;
    mockEditorState.selectionTo = nextCursor;
  },
  replaceSelection: (content) => {
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

export function MarkdownEditor({
  ariaLabel,
  readingSelection,
  nodeViewState,
  value,
  onChange,
  onImageLoadStateChange,
  onReady,
  reviewEscapeBlurEnabled
}: {
  ariaLabel?: string;
  readingSelection?: { from: number; to: number } | null;
  nodeViewState?: { selection: { from: number; to: number } };
  value: string;
  onChange: (value: string) => void;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  reviewEscapeBlurEnabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  mockEditorState.content = value;
  useLayoutEffect(() => {
    onImageLoadStateChange?.({ loadedCount: 0, totalCount: 0 });
    onReady?.(mockEditorAdapter);
    return () => onReady?.(null);
  }, [onImageLoadStateChange, onReady]);
  useEffect(() => {
    if (readingSelection) mockEditorAdapter.restoreSelection(readingSelection);
  }, [readingSelection]);
  useEffect(() => {
    if (nodeViewState) mockEditorAdapter.restoreSelection(nodeViewState.selection);
  }, [nodeViewState]);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !reviewEscapeBlurEnabled) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        textarea.blur();
      }
    };
    textarea.addEventListener('keydown', handleKeyDown, true);
    return () => textarea.removeEventListener('keydown', handleKeyDown, true);
  }, [reviewEscapeBlurEnabled]);
  return (
    <textarea
      aria-label={ariaLabel ?? 'Mock editor'}
      data-review-escape-blur={reviewEscapeBlurEnabled ? 'true' : 'false'}
      data-testid={ariaLabel === 'Answer editor' ? 'answer-editor-value' : 'editor-value'}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        mockEditorState.content = nextValue;
        onChange(nextValue);
      }}
      ref={textareaRef}
      value={value}
    />
  );
}
