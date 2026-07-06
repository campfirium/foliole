import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

const readableArticleDocumentMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => (
  <article>
    <button data-testid="article-inline-control" type="button">Control</button>
    <div data-testid="article-body">Readable body</div>
  </article>
));
const selectionToolbarLayerMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => (
  <button data-companion-selection-toolbar="true" data-testid="selection-toolbar-action" type="button">
    Highlight
  </button>
));
const closeSelectionToolbarMock = vi.fn();
const openSelectionToolbarMock = vi.fn();

vi.mock('./CompanionReadableArticleDocument', () => ({
  ReadableArticleDocument: (props: Record<string, unknown>) => readableArticleDocumentMock(props)
}));

vi.mock('./CompanionReadableArticleSelectionToolbarLayer', () => ({
  SelectionAnnotationToolbarLayer: (props: Record<string, unknown>) => selectionToolbarLayerMock(props)
}));

vi.mock('./CompanionReadingChrome', () => ({
  ReadingChrome: () => null
}));

vi.mock('./CompanionReadingSheets', () => ({
  OutlineSheet: () => null,
  ReadingActionsSheet: () => null,
  ReadingFontSheet: () => null,
  ReadingHighlightSheet: () => null,
  ReadingInfoSheet: () => null
}));

vi.mock('./CompanionDocumentSearchSheet', () => ({
  CompanionDocumentSearchSheet: () => null
}));

vi.mock('./useCompanionSelectionAnnotationToolbar', () => ({
  useCompanionSelectionAnnotationToolbar: () => ({
    clearSelectionAndCloseToolbar: vi.fn(),
    closeSelectionToolbar: closeSelectionToolbarMock,
    editorRef: { current: null },
    handleEditorReady: vi.fn(),
    openSelectionToolbar: openSelectionToolbarMock,
    resolveSelectionPayload: vi.fn(),
    selectionToolbar: null
  })
}));

vi.mock('./useImmersiveReadableArticleState', () => ({
  useImmersiveReadableArticleState: () => ({
    handleSelectOutlineItem: vi.fn(),
    handleSurfaceClick: vi.fn(),
    isActionsSheetOpen: false,
    isChromeVisible: false,
    isContentEditing: false,
    isOutlineOpen: false,
    isSearchSheetOpen: false,
    openDocumentSearch: vi.fn(),
    openReadingSheet: null,
    readingSelection: null,
    enterContentEditing: vi.fn(),
    exitContentEditing: vi.fn(),
    setIsActionsSheetOpen: vi.fn(),
    setIsOutlineOpen: vi.fn(),
    setIsSearchSheetOpen: vi.fn(),
    setOpenReadingSheet: vi.fn()
  })
}));

function createReadableArticle() {
  return {
    content: 'Readable body',
    hideTitleHeading: false,
    isTrashed: false,
    nodeId: 'topic-1',
    persistedNodeViewState: null,
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: 'Topic'
  } as const;
}

function renderArticle() {
  return render(
    <ImmersiveReadableArticle
      onExit={vi.fn()}
      onCreateSelectionAnnotation={vi.fn()}
      readableArticle={createReadableArticle()}
      snapshot={null}
    />
  );
}

describe('ImmersiveReadableArticle selection toolbar pointer guard', () => {
  beforeEach(() => {
    closeSelectionToolbarMock.mockClear();
    openSelectionToolbarMock.mockClear();
  });

  it('does not close or open the selection toolbar from toolbar pointer events', () => {
    const { getByTestId } = renderArticle();

    fireEvent.pointerDown(getByTestId('selection-toolbar-action'));
    fireEvent.pointerUp(getByTestId('selection-toolbar-action'));

    expect(closeSelectionToolbarMock).not.toHaveBeenCalled();
    expect(openSelectionToolbarMock).not.toHaveBeenCalled();
  });

  it('does not route ordinary article controls into selection toolbar handling', () => {
    const { getByTestId } = renderArticle();

    fireEvent.pointerDown(getByTestId('article-inline-control'));
    fireEvent.pointerUp(getByTestId('article-inline-control'));
    fireEvent.touchMove(getByTestId('article-inline-control'));

    expect(closeSelectionToolbarMock).not.toHaveBeenCalled();
    expect(openSelectionToolbarMock).not.toHaveBeenCalled();
  });

  it('still routes article body pointer up into selection toolbar handling', () => {
    const { getByTestId } = renderArticle();

    fireEvent.pointerUp(getByTestId('article-body'));

    expect(closeSelectionToolbarMock).not.toHaveBeenCalled();
    expect(openSelectionToolbarMock).toHaveBeenCalledTimes(1);
  });
});