import { useEffect, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { dispatchReviewEditorEscapeBlur } from '../shared/platform/reviewEditorEscape';

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

interface MockMarkdownEditorProps {
  ariaLabel?: string;
  className?: string;
  readingSelection?: { from: number; to: number } | null;
  nodeId?: string | null;
  nodeViewState?: { selection: { from: number; to: number } };
  value: string;
  onChange: (value: string) => void;
  onDocumentInput?: (meta: { nodeId: string | null }) => void;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  reviewEscapeBlurEnabled?: boolean;
}

interface MockEditorChangeProps {
  nodeId: string | null;
  onChange: (value: string) => void;
  onDocumentInput: ((meta: { nodeId: string | null }) => void) | undefined;
}

function handleMockEditorChange(event: ChangeEvent<HTMLTextAreaElement>, props: MockEditorChangeProps) {
  const nextValue = event.currentTarget.value;
  mockEditorState.content = nextValue;
  props.onDocumentInput?.({ nodeId: props.nodeId ?? null });
  props.onChange(nextValue);
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function useMockReviewEscapeBlur(args: {
  enabled: boolean | undefined;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const root = args.rootRef.current;
    if (!root) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        blurActiveElement();
        if (args.enabled) {
          dispatchReviewEditorEscapeBlur();
        }
      }
    };
    root.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      root.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [args.enabled, args.rootRef]);
}

interface MockMarkdownEditorSurfaceProps {
  ariaLabel: string | undefined;
  className: string | undefined;
  nodeId: string | null;
  onChange: (value: string) => void;
  onDocumentInput: ((meta: { nodeId: string | null }) => void) | undefined;
  reviewEscapeBlurEnabled: boolean | undefined;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  value: string;
}

function MockMarkdownEditorSurface(props: MockMarkdownEditorSurfaceProps) {
  const handleEscapeKeyDown = (event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') {
      return;
    }
    blurActiveElement();
    if (props.reviewEscapeBlurEnabled) {
      dispatchReviewEditorEscapeBlur();
    }
  };
  return (
    <div
      className={['markdown-editor-host', props.className].filter(Boolean).join(' ')}
      data-review-escape-blur={props.reviewEscapeBlurEnabled ? 'true' : 'false'}
      onKeyDownCapture={handleEscapeKeyDown}
      ref={props.rootRef}
    >
      <textarea
        aria-label={props.ariaLabel ?? 'Mock editor'}
        data-testid={props.ariaLabel === 'Answer editor' ? 'answer-editor-value' : 'editor-value'}
        onChange={(event) =>
          handleMockEditorChange(event, {
            nodeId: props.nodeId,
            onChange: props.onChange,
            onDocumentInput: props.onDocumentInput
          })
        }
        onKeyDown={handleEscapeKeyDown}
        ref={props.textareaRef}
        value={props.value}
      />
    </div>
  );
}

export function MarkdownEditor({
  ariaLabel,
  className,
  readingSelection,
  nodeId,
  nodeViewState,
  value,
  onChange,
  onDocumentInput,
  onImageLoadStateChange,
  onReady,
  reviewEscapeBlurEnabled
}: MockMarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
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
  useMockReviewEscapeBlur({ enabled: reviewEscapeBlurEnabled, rootRef });
  return (
    <MockMarkdownEditorSurface
      ariaLabel={ariaLabel}
      className={className}
      nodeId={nodeId ?? null}
      onChange={onChange}
      onDocumentInput={onDocumentInput}
      reviewEscapeBlurEnabled={reviewEscapeBlurEnabled}
      rootRef={rootRef}
      textareaRef={textareaRef}
      value={value}
    />
  );
}
