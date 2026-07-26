import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';
import {
  attachPanelAdapters,
  createScrollAdapter,
  type PanelBodyCall
} from './DocumentSourceUpdatePanel.testSupport';

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

function renderPanel(
  currentContent: string,
  updatedContent: string,
  onOpenChange = () => undefined,
  options: {
    comparisonMode?: 'manual' | 'source_preview';
    manualContent?: string;
    onManualContentChange?: (content: string) => void;
    onManualSaveAsTopic?: () => Promise<void>;
    sourceAvailable?: boolean;
  } = {}
) {
  const comparisonMode = options.comparisonMode ?? 'source_preview';
  renderWithLocalization(
    <DocumentSourceUpdatePanel
      comparisonMode={comparisonMode}
      comparisonSource={comparisonMode === 'manual' ? 'manual' : 'source'}
      currentContent={currentContent}
      currentHighlightCount={1}
      currentNodeId="node-1"
      documentMaxWidth={760}
      editorAppearanceKey="appearance-1"
      manualContent={options.manualContent ?? ''}
      onCurrentContentChange={() => undefined}
      onManualContentChange={options.onManualContentChange ?? (() => undefined)}
      onManualSaveAsTopic={options.onManualSaveAsTopic ?? (async () => undefined)}
      onManualSetAsBody={async () => undefined}
      onOpenChange={onOpenChange}
      onSourceChange={() => undefined}
      open
      sourceAvailable={options.sourceAvailable ?? true}
      updatedHighlightCount={2}
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
        editorNodeId: 'node-1'
      })
    );
    expect(getPanelBodyCall(0)).not.toMatchObject({ readOnly: true });
    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        editorAppearanceKey: 'appearance-1-source-update-reference',
        editorContent: 'alpha\ngamma',
        editorNodeId: null,
        readOnly: true
      })
    );
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(2);
  });

  it('shows a compact review chrome while keeping the overview ruler', () => {
    renderPanel('# Existing title\nsecond\nfourth', '# Updated topic\nsecond\nthird\nfourth changed');

    expect(screen.getByText('Compare')).toBeInTheDocument();
    expect(screen.getByText('Compare imported file with current document')).toBeInTheDocument();
    expect(screen.queryByText('Updated topic')).not.toBeInTheDocument();
    expect(screen.getByText('Current Topic')).toBeInTheDocument();
    expect(screen.getByText('editable')).toBeInTheDocument();
    expect(screen.getByText('Incoming')).toBeInTheDocument();
    expect(screen.getByText('read-only')).toBeInTheDocument();
    expect(screen.getByLabelText('Comparison overview ruler')).toBeInTheDocument();
    expect(screen.queryByLabelText('Close source update panel')).not.toBeInTheDocument();
    expect(screen.queryByText('1 highlight')).not.toBeInTheDocument();
    expect(screen.queryByText('Incoming has 2 highlights, from 1')).not.toBeInTheDocument();
  });

  it('closes with Escape without a visible close button', () => {
    const onOpenChange = vi.fn();

    renderPanel('alpha', 'beta', onOpenChange);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
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
          spacerDecorations: [{ beforeLineNumber: 3, kind: 'removed', lines: [{ className: 'cm-line-paragraph', lineNumber: 3, text: 'left only' }] }]
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

});

describe('DocumentSourceUpdatePanel overview ruler', () => {
  resetPanelBodyMock();

  it('renders overview markers and jumps to the clicked diff segment', () => {
    renderPanel('title\nsame\nleft only\nend', 'title\nsame\nright only\nend');

    const currentAdapter = createScrollAdapter();
    const updatedAdapter = createScrollAdapter();

    attachPanelAdapters(documentPanelBodyMock.mock.calls, currentAdapter, updatedAdapter);

    const markers = screen.getAllByTestId('source-update-overview-marker');
    expect(markers).toHaveLength(1);

    fireEvent.click(markers[0]!);

    expect(currentAdapter.revealPosition).toHaveBeenCalledWith(11);
    expect(updatedAdapter.revealPosition).toHaveBeenCalledWith(11);
  });

  it('splits a tall overview marker into blocks while keeping jump controls', () => {
    renderPanel(
      'one\ntwo\nthree\nfour\nfive\nsix\nseven',
      'one\ntwo updated\nthree updated\nfour updated\nfive updated\nsix updated\nseven'
    );

    expect(screen.getAllByTestId('source-update-overview-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('source-update-overview-marker-block')).toHaveLength(3);
    expect(screen.getByLabelText('Jump to previous diff')).toBeInTheDocument();
    expect(screen.getByLabelText('Jump to next diff')).toBeInTheDocument();
  });
});
