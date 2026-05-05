import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

const { documentPanelBodyMock } = vi.hoisted(() => ({
  documentPanelBodyMock: vi.fn((props: unknown) => {
    void props;
    return <div data-testid="document-panel-body" />;
  })
}));

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: (props: unknown) => {
    documentPanelBodyMock(props);
    return <div data-testid="document-panel-body" />;
  }
}));

interface PanelBodyCall {
  editorDiffDecorations?: unknown;
  onEditorReady?: (adapter: unknown) => void;
}

function createScrollAdapter(options?: {
  getScrollTop?: () => number;
  onScroll?: (listener: () => void) => () => void;
  revealPosition?: ReturnType<typeof vi.fn>;
  scrollTop?: number;
  setScrollTop?: (scrollTop: number) => void;
}) {
  let scrollTop = options?.scrollTop ?? 0;

  return {
    getLineBlockHeight: () => 24,
    getScrollMetrics: () => ({ clientHeight: 300, scrollHeight: 1200, scrollTop: options?.getScrollTop?.() ?? scrollTop }),
    getScrollTop: () => options?.getScrollTop?.() ?? scrollTop,
    onScroll: options?.onScroll ?? (() => () => undefined),
    revealPosition: options?.revealPosition ?? vi.fn(),
    setScrollTop: vi.fn((nextScrollTop: number) => {
      scrollTop = nextScrollTop;
      options?.setScrollTop?.(nextScrollTop);
    })
  };
}

function renderPanel(currentContent: string, updatedContent: string) {
  render(
    <DocumentSourceUpdatePanel
      currentContent={currentContent}
      currentNodeId="node-1"
      documentMaxWidth={760}
      editorAppearanceKey="appearance-1"
      onCurrentContentChange={() => undefined}
      onOpenChange={() => undefined}
      open
      updatedContent={updatedContent}
    />
  );
}

function getPanelBodyCall(callNumber: number) {
  return (documentPanelBodyMock.mock.calls[callNumber]?.[0] ?? {}) as PanelBodyCall;
}

function resetPanelBodyMock() {
  beforeEach(() => {
    documentPanelBodyMock.mockClear();
  });
}

describe('DocumentSourceUpdatePanel rendering', () => {
  resetPanelBodyMock();

  it('renders both sides with the same document surface and keeps the right side read-only', () => {
    renderPanel('alpha\nbeta', 'alpha\ngamma');

    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        editorAppearanceKey: 'appearance-1-source-update-current',
        editorContent: 'alpha\nbeta',
        editorHideScrollbar: true,
        editorNodeId: 'node-1',
        readOnly: undefined
      })
    );
    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        editorContentPaddingRight: '5.5rem',
        editorAppearanceKey: 'appearance-1-source-update-reference',
        editorContent: 'alpha\ngamma',
        editorNodeId: null,
        readOnly: true
      })
    );
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(2);
  });

  it('shows the revised panel copy that matches the main document framing', () => {
    renderPanel('first\nsecond\nfourth', 'first\nsecond\nthird\nfourth changed');

    expect(
      screen.getByText(
        'This side keeps the same reading and editing feel as the main document, stays vertically synced with the updated source, and leaves aligned gaps where the source has extra lines.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This side uses the same document rendering, stays read-only, follows the current draft while you scroll, and leaves aligned gaps where the draft has extra lines.'
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Comparison overview ruler')).toBeInTheDocument();
  });

});

describe('DocumentSourceUpdatePanel diff hints', () => {
  resetPanelBodyMock();

  it('pairs one-for-one changed lines without inserting extra gaps', () => {
    renderPanel('title\nsame\nleft only\nend', 'title\nsame\nright only\nend');

    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        editorDiffDecorations: {
          lineDecorations: [{ kind: 'removed', lineNumber: 3 }],
          spacerDecorations: []
        }
      })
    );
    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        editorDiffDecorations: {
          lineDecorations: [{ kind: 'added', lineNumber: 3 }],
          spacerDecorations: []
        }
      })
    );
  });

  it('adds a gap only on the side missing unmatched extra lines', () => {
    renderPanel('title\nsame\nleft only\nend', 'title\nsame\nend');

    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        editorDiffDecorations: {
          lineDecorations: [{ kind: 'removed', lineNumber: 3 }],
          spacerDecorations: []
        }
      })
    );
    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        editorDiffDecorations: {
          lineDecorations: [],
          spacerDecorations: [{ beforeLineNumber: 3, kind: 'removed', lines: [{ className: null, lineNumber: 3, text: 'left only' }] }]
        }
      })
    );
  });
});

describe('DocumentSourceUpdatePanel scroll sync', () => {
  resetPanelBodyMock();

  it('syncs vertical scrolling between the two editors', () => {
    const currentScrollListeners: Array<() => void> = [];
    let currentScrollTop = 120;
    let updatedScrollTop = 0;

    renderPanel('current', 'updated');

    const currentReady = getPanelBodyCall(0).onEditorReady;
    const updatedReady = getPanelBodyCall(1).onEditorReady;

    const currentAdapter = createScrollAdapter({
      getScrollTop: () => currentScrollTop,
      onScroll: (listener: () => void) => {
        currentScrollListeners.push(listener);
        return () => undefined;
      },
      scrollTop: currentScrollTop,
      setScrollTop: (scrollTop: number) => {
        currentScrollTop = scrollTop;
      }
    });
    const updatedAdapter = createScrollAdapter({
      onScroll: () => () => undefined,
      scrollTop: updatedScrollTop,
      setScrollTop: (scrollTop: number) => {
        updatedScrollTop = scrollTop;
      }
    });

    act(() => {
      currentReady?.(currentAdapter as never);
      updatedReady?.(updatedAdapter as never);
    });

    expect(updatedAdapter.setScrollTop).toHaveBeenCalledWith(120);

    act(() => {
      currentScrollTop = 260;
      currentScrollListeners.forEach((listener) => listener());
    });

    expect(updatedAdapter.setScrollTop).toHaveBeenLastCalledWith(260);
  });

  it('renders overview markers and jumps to the clicked diff segment', () => {
    renderPanel('title\nsame\nleft only\nend', 'title\nsame\nright only\nend');

    const currentReady = getPanelBodyCall(0).onEditorReady;
    const updatedReady = getPanelBodyCall(1).onEditorReady;
    const currentAdapter = createScrollAdapter();
    const updatedAdapter = createScrollAdapter();

    act(() => {
      currentReady?.(currentAdapter as never);
      updatedReady?.(updatedAdapter as never);
    });

    const markers = screen.getAllByTestId('source-update-overview-marker');
    expect(markers).toHaveLength(1);

    fireEvent.click(markers[0]!);

    expect(currentAdapter.revealPosition).toHaveBeenCalledWith(11);
    expect(updatedAdapter.revealPosition).toHaveBeenCalledWith(11);
  });
});
