import { readFileSync } from 'node:fs';

import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

const readableArticleDocumentMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => <article>Readable body</article>);
const readingChromeMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => null);
const selectionToolbarLayerMock = vi.fn<(props: Record<string, unknown>) => ReactNode>(() => (
  <button data-companion-selection-toolbar={'true'} data-testid={'selection-toolbar-action'} type={'button'}>
    Highlight
  </button>
));
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
  SelectionAnnotationToolbarLayer: (props: Record<string, unknown>) => selectionToolbarLayerMock(props)
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
    handleSurfacePointerDown: vi.fn(),
    handleSurfacePointerMove: vi.fn(),
    handleSurfacePointerUp: vi.fn(),
    handleSurfacePointerCancel: vi.fn(),
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

function resetArticleSurfaceMocks() {
  chromeVisible = false;
  contentEditing = false;
  readingChromeMock.mockClear();
  readableArticleDocumentMock.mockClear();
  toolbarHookMock.mockClear();
  selectionToolbarLayerMock.mockClear();
  toolbarHookOverride = null;
  editorFocusMock.mockClear();
  enterContentEditingMock.mockClear();
}

describe('reading image controls', () => {
  beforeEach(resetArticleSurfaceMocks);
  it('shows image expansion with reading chrome and hides it again without requiring hover', () => {
    const style = document.createElement('style');
    style.textContent = '.cm-md-image-preview-trigger { opacity: 0; pointer-events: none; }\n' + readFileSync('src/companion/companionImageControls.css', 'utf8');
    document.head.append(style);
    readableArticleDocumentMock.mockImplementation(() => <div className="cm-md-image-surface"><button className="cm-md-image-preview-trigger">Open image preview</button></div>);
    try {
      const article = <ImmersiveReadableArticle onExit={vi.fn()} readableArticle={createReadableArticle()} snapshot={null} />;
      const view = render(article);
      const trigger = view.getByRole('button', { name: 'Open image preview' });
      expect(getComputedStyle(trigger).opacity).toBe('0');
      expect(getComputedStyle(trigger).pointerEvents).toBe('none');
      chromeVisible = true;
      view.rerender(<ImmersiveReadableArticle onExit={vi.fn()} readableArticle={createReadableArticle()} snapshot={null} />);
      expect(getComputedStyle(trigger).opacity).toBe('1');
      expect(getComputedStyle(trigger).pointerEvents).toBe('auto');
      chromeVisible = false;
      view.rerender(<ImmersiveReadableArticle onExit={vi.fn()} readableArticle={createReadableArticle()} snapshot={null} />);
      expect(getComputedStyle(trigger).opacity).toBe('0');
    } finally {
      style.remove();
      readableArticleDocumentMock.mockImplementation(() => <article>Readable body</article>);
    }
  });

});
