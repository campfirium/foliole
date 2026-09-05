import { vi } from 'vitest';

import type { EditorScrollEvent, EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import { useImmersiveReadingMode } from './useImmersiveReadingMode';

type ImmersiveProps = Parameters<typeof useImmersiveReadingMode>[0];

function createNode(id: string) {
  return {
    anchorLink: null,
    content: 'Alpha\n\nBeta',
    createdAt: '',
    id,
    kind: 'topic' as const,
    parentNodeId: null,
    reveal: '',
    review: null,
    title: id,
    updatedAt: ''
  };
}

function buildAdapter() {
  let selection: EditorSelection = { from: 0, to: 0 };
  let scrollListener: ((event: EditorScrollEvent) => void) | null = null;
  const adapter = {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Alpha\n\nBeta'),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getPrimaryVisiblePosition: vi.fn<() => number | null>(() => null),
    getViewportRect: vi.fn(() => ({ bottom: 260, height: 200, left: 0, right: 400, top: 60, width: 400, x: 0, y: 60, toJSON: () => ({}) })),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(() => ({ clientHeight: 100, scrollHeight: 100, scrollTop: 0 })),
    getScrollTop: vi.fn(() => 0),
    getSelection: vi.fn(() => selection),
    getSelectionRanges: vi.fn(() => [selection]),
    onContentChange: vi.fn(),
    onScroll: vi.fn((listener: (event: EditorScrollEvent) => void) => {
      scrollListener = listener;
      return () => {
        if (scrollListener === listener) {
          scrollListener = null;
        }
      };
    }),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    revealSelectionAtViewportRatio: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection: vi.fn((nextSelection: EditorSelection) => {
      selection = nextSelection;
    }),
    isPositionNearViewportRatio: vi.fn(() => true),
    setParagraphMarker: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setReadOnly: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn((nextSelection: EditorSelection) => {
      selection = nextSelection;
    }),
    setSelectionRanges: vi.fn()
  };
  return {
    adapter,
    triggerScroll: (event: EditorScrollEvent = { userInitiated: true }) => scrollListener?.(event)
  };
}

export function buildProps() {
  const { adapter, triggerScroll } = buildAdapter();
  let readingSelection: EditorSelection | null = null;
  let applyingSelection: EditorSelection | null = null;
  return {
    adapter,
    props: {
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      isImmersiveMode: true,
      isStudyMode: false,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') },
      onCreateSelectionHighlight: vi.fn(),
      onToggleSelectionHighlight: vi.fn(() => 'created'),
      onCreateSelectionNote: vi.fn(),
      onExitImmersiveMode: vi.fn(),
      onRevealDocumentSelection: vi.fn((nextSelection: EditorSelection) => {
        adapter.revealSelection(nextSelection);
        readingSelection = nextSelection;
      }),
      beginApplyingReadingPosition: (selection: EditorSelection) => {
        applyingSelection = selection;
      },
      completeApplyingReadingPosition: () => {
        applyingSelection = null;
      },
      getReadingPositionSelection: () => readingSelection,
      getReadingPositionSyncState: () =>
        applyingSelection ? { reason: 'test', startedAt: Date.now(), targetSelection: applyingSelection } : null,
      setReadingPositionSelection: (selection: EditorSelection) => {
        readingSelection = selection;
      },
      onSelectNode: vi.fn(),
      onToggleImmersiveMode: vi.fn(),
      trashedNodeIds: []
    } as ImmersiveProps,
    triggerScroll
  };
}

export function buildImageScrollProps() {
  const built = buildProps();
  vi.mocked(built.adapter.getContent).mockReturnValue('Alpha\n\n![Cover](asset://hash-1.png)\n\nGamma');
  vi.mocked(built.adapter.getSelection).mockReturnValue({ from: 7, to: 35 });
  return built;
}

export function mountViewportHost() {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} });
  const scroller = document.createElement('div');
  scroller.className = 'cm-scroller';
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    value: () => ({ bottom: 260, height: 200, left: 0, right: 400, top: 60, width: 400, x: 0, y: 60 })
  });
  const host = document.createElement('div');
  host.className = 'prompt-editor-host';
  host.append(scroller);
  document.body.append(host);
}
