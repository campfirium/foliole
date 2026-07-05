import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

const readableArticleDocumentMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => <article>Readable body</article>);
const readingChromeMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => null);
const toolbarHookMock = vi.fn();
const editorFocusMock = vi.fn();
const enterContentEditingMock = vi.fn();
let toolbarHookOverride: Record<string, unknown> | null = null;
let chromeVisible = false;
let contentEditing = false;

vi.mock('./CompanionReadableArticleDocument', () => ({
  ReadableArticleDocument: (props: Record<string, unknown>) => readableArticleDocumentMock(props)
}));

vi.mock('./CompanionReadableArticleSelectionToolbarLayer', () => ({
  SelectionAnnotationToolbarLayer: () => (
    <button data-companion-selection-toolbar="true" data-testid="selection-toolbar-action" type="button">
      Highlight
    </button>
  )
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
  isCompanionSelectionToolbarTarget: (target: EventTarget | null) =>
    target instanceof Element && target.closest('[data-companion-selection-toolbar="true"]') !== null,
  useCompanionSelectionAnnotationToolbar: (props: Record<string, unknown>) => {
    toolbarHookMock(props);
    if (toolbarHookOverride) return toolbarHookOverride;
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
    toolbarHookOverride = null;
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
    toolbarHookOverride = null;
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

describe('ImmersiveReadableArticle selection toolbar pointer guard', () => {
  it('does not close the selection toolbar from toolbar pointer events', () => {
    const closeSelectionToolbar = vi.fn();
    const openSelectionToolbar = vi.fn();
    toolbarHookOverride = {
      clearSelectionAndCloseToolbar: vi.fn(),
      closeSelectionToolbar,
      editorRef: { current: null },
      handleEditorReady: vi.fn(),
      openSelectionToolbar,
      resolveSelectionPayload: vi.fn(),
      selectionToolbar: null
    };
    const { getByTestId } = render(
      <ImmersiveReadableArticle
        onExit={vi.fn()}
        onCreateSelectionAnnotation={vi.fn()}
        readableArticle={createReadableArticle()}
        snapshot={null}
      />
    );

    fireEvent.pointerDown(getByTestId('selection-toolbar-action'));
    fireEvent.pointerUp(getByTestId('selection-toolbar-action'));

    expect(closeSelectionToolbar).not.toHaveBeenCalled();
    expect(openSelectionToolbar).not.toHaveBeenCalled();
  });
});
