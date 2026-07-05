import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

const readableArticleDocumentMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => <article>Readable body</article>);
const readingChromeMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => null);
const toolbarHookMock = vi.fn();
const editorFocusMock = vi.fn();
const enterContentEditingMock = vi.fn();
let chromeVisible = false;
let contentEditing = false;

vi.mock('./CompanionReadableArticleDocument', () => ({
  ReadableArticleDocument: (props: Record<string, unknown>) => readableArticleDocumentMock(props)
}));

vi.mock('./CompanionReadableArticleSelectionToolbarLayer', () => ({
  SelectionAnnotationToolbarLayer: () => null
}));

vi.mock('./CompanionReadingChrome', () => ({
  ReadingChrome: (props: Record<string, unknown>) => readingChromeMock(props)
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
  useCompanionSelectionAnnotationToolbar: (props: Record<string, unknown>) => {
    toolbarHookMock(props);
    return {
    clearSelectionAndCloseToolbar: vi.fn(),
    closeSelectionToolbar: vi.fn(),
    editorRef: { current: { focus: editorFocusMock } },
    handleEditorReady: vi.fn(),
    openSelectionToolbar: vi.fn(),
    resolveSelectionPayload: vi.fn(),
    selectionToolbar: null
  };
  }
}));

vi.mock('./useImmersiveReadableArticleState', () => ({
  useImmersiveReadableArticleState: () => ({
    handleSelectOutlineItem: vi.fn(),
    handleSurfaceClick: vi.fn(),
    isActionsSheetOpen: false,
    isChromeVisible: chromeVisible,
    isContentEditing: contentEditing,
    isOutlineOpen: false,
    openDocumentSearch: vi.fn(),
    openReadingSheet: null,
    readingSelection: null,
    searchOpen: false,
    enterContentEditing: enterContentEditingMock,
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

describe('ImmersiveReadableArticle Android scrolling', () => {
  beforeEach(() => {
    chromeVisible = false;
    contentEditing = false;
    readingChromeMock.mockClear();
    readableArticleDocumentMock.mockClear();
    toolbarHookMock.mockClear();
    editorFocusMock.mockClear();
    enterContentEditingMock.mockClear();
  });

  it('lets the immersive surface own article scrolling for old Android WebView touch gestures', () => {
    chromeVisible = true;
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
    expect(readableArticleDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ allowContentEditing: false }));
    expect(readingChromeMock).toHaveBeenCalledWith(expect.objectContaining({ isContentEditing: false }));
  });

  it('reserves top space when the fixed reading chrome is visible', () => {
    chromeVisible = true;
    const { container } = render(
      <ImmersiveReadableArticle
        onExit={vi.fn()}
        readableArticle={createReadableArticle()}
        snapshot={null}
      />
    );

    expect(container.querySelector('section')).toHaveClass('pt-36');
  });

  it('enables article editing only after the explicit reading edit mode is active', () => {
    chromeVisible = true;
    contentEditing = true;
    render(
      <ImmersiveReadableArticle
        onExit={vi.fn()}
        onCreateSelectionAnnotation={vi.fn()}
        onSaveArticleContent={vi.fn()}
        readableArticle={createReadableArticle()}
        snapshot={null}
      />
    );

    expect(readableArticleDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ allowContentEditing: true }));
    expect(toolbarHookMock).toHaveBeenCalledWith(expect.objectContaining({ canCreateAnnotation: false }));
    expect(readingChromeMock).toHaveBeenCalledWith(expect.objectContaining({
      canEditContent: true,
      isContentEditing: true
    }));
  });
});

describe('ImmersiveReadableArticle edit mode', () => {
  beforeEach(() => {
    chromeVisible = false;
    contentEditing = false;
    readingChromeMock.mockClear();
    readableArticleDocumentMock.mockClear();
    toolbarHookMock.mockClear();
    editorFocusMock.mockClear();
    enterContentEditingMock.mockClear();
  });

  it('enters edit mode from the pencil without focusing the editor immediately', () => {
    chromeVisible = true;
    render(
      <ImmersiveReadableArticle
        onExit={vi.fn()}
        onCreateSelectionAnnotation={vi.fn()}
        onSaveArticleContent={vi.fn()}
        readableArticle={createReadableArticle()}
        snapshot={null}
      />
    );

    const chromeProps = readingChromeMock.mock.calls.at(-1)?.[0] as { onToggleContentEditing(): void };
    chromeProps.onToggleContentEditing();

    expect(enterContentEditingMock).toHaveBeenCalledTimes(1);
    expect(editorFocusMock).not.toHaveBeenCalled();
  });

  it('does not enter edit mode when the reader taps the article text', () => {
    const { container } = render(
      <ImmersiveReadableArticle
        onExit={vi.fn()}
        onCreateSelectionAnnotation={vi.fn()}
        onSaveArticleContent={vi.fn()}
        readableArticle={createReadableArticle()}
        snapshot={null}
      />
    );

    container.querySelector('section')?.click();

    expect(enterContentEditingMock).not.toHaveBeenCalled();
    expect(readableArticleDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ allowContentEditing: false }));
  });
});
