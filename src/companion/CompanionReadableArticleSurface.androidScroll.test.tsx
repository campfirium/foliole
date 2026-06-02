import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

const readableArticleDocumentMock = vi.fn(() => <article>Readable body</article>);

vi.mock('./CompanionReadableArticleDocument', () => ({
  ReadableArticleDocument: (props: { scrollContainer?: 'editor' | 'outer' }) => readableArticleDocumentMock(props)
}));

vi.mock('./CompanionReadableArticleSelectionToolbarLayer', () => ({
  SelectionAnnotationToolbarLayer: () => null
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
    closeSelectionToolbar: vi.fn(),
    editorRef: { current: null },
    handleEditorReady: vi.fn(),
    openSelectionToolbar: vi.fn(),
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
    isOutlineOpen: false,
    openDocumentSearch: vi.fn(),
    openReadingSheet: null,
    readingSelection: null,
    searchOpen: false,
    setIsActionsSheetOpen: vi.fn(),
    setIsOutlineOpen: vi.fn(),
    setIsSearchSheetOpen: vi.fn(),
    setOpenReadingSheet: vi.fn()
  })
}));

function createReadableArticle() {
  return {
    bodyStatus: 'ready',
    content: 'Readable body',
    contentPaddingTop: undefined,
    hideTitleHeading: false,
    isTrashed: false,
    nodeId: 'topic-1',
    persistedNodeViewState: null,
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: 'Topic'
  };
}

describe('ImmersiveReadableArticle Android scrolling', () => {
  it('lets the immersive surface own article scrolling for old Android WebView touch gestures', () => {
    const { container } = render(
      <ImmersiveReadableArticle
        onExit={vi.fn()}
        readableArticle={createReadableArticle()}
        snapshot={null}
      />
    );

    const surface = container.querySelector('section');
    expect(surface).toHaveClass('fixed', 'top-0', 'right-0', 'bottom-0', 'left-0', 'overflow-y-auto');
    expect(surface).not.toHaveClass('inset-0');
    expect(readableArticleDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ scrollContainer: 'outer' }));
  });
});
