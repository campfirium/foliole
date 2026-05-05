import { Page } from 'react-pdf';

import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { renderPdfOverlayMarker, renderPdfOverlayRects, resolvePdfOverlayMarkerSize } from './pdfOverlayRender';
import { resolvePageText } from './pdfPageText';

interface PdfPageRenderLocator {
  id: string;
  page: number;
  rects?: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

interface RenderPdfPageArgs {
  highlightLocators: PdfPageRenderLocator[];
  onTextContentLoad: (pageNumber: number, text: string) => void;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pageNumber: number;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  rotation: number;
  searchHighlights: PdfSearchVisualHighlight[];
  zoom: number;
}

export function renderPdfPage(args: RenderPdfPageArgs) {
  const pageHighlights = args.highlightLocators.filter((locator) => locator.page === args.pageNumber);
  const pageSearchHighlights = args.searchHighlights.filter((highlight) => highlight.page === args.pageNumber);
  const markerSize = resolvePdfOverlayMarkerSize(args.zoom);
  const selectionLocator = args.pdfSelectionLocator?.page === args.pageNumber ? { ...args.pdfSelectionLocator, id: 'pdf-selection-overlay' } : null;
  return (
    <div
      className="relative flex w-full justify-center px-4"
      data-pdf-page-number={args.pageNumber}
      data-testid="pdf-document-page-shell"
      key={args.pageNumber}
      ref={(element) => {
        args.pageElementsRef.current[args.pageNumber] = element;
      }}
    >
      <div className="relative inline-block">
        <Page
          className="mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-sm"
          data-testid="pdf-document-page"
          onGetTextSuccess={(textContent: unknown) => {
            args.onTextContentLoad(args.pageNumber, resolvePageText(textContent));
          }}
          onRenderTextLayerSuccess={() => {
            stripTextLayerInlineFonts(args.pageElementsRef.current[args.pageNumber]);
            args.onTextLayerRender(args.pageNumber);
          }}
          pageNumber={args.pageNumber}
          renderAnnotationLayer
          renderTextLayer
          rotate={args.rotation}
          scale={args.zoom / 100}
        />
        {pageHighlights.map((locator) => {
          const highlightRects = renderPdfOverlayRects(locator);
          return highlightRects ?? renderPdfOverlayMarker(locator, markerSize);
        })}
        {renderSearchHighlightsOnPage(pageSearchHighlights, markerSize)}
        {renderSelectionOverlay(selectionLocator, markerSize)}
      </div>
    </div>
  );
}

function renderSearchHighlightsOnPage(pageSearchHighlights: PdfSearchVisualHighlight[], markerSize: number) {
  const pageSearchMatches = pageSearchHighlights.filter((highlight) => !highlight.isActive);
  const activeSearchMatch = pageSearchHighlights.find((highlight) => highlight.isActive) ?? null;
  return (
    <>
      {pageSearchMatches.map((match) =>
        renderPdfOverlayRects(
          match,
          'pointer-events-none absolute z-20 rounded-[2px] bg-[color:rgb(var(--app-highlight-color-rgb)/0.3)] ring-1 ring-[color:rgb(var(--app-highlight-color-rgb)/0.5)]',
          'pdf-search-match-weak'
        ) ??
        renderPdfOverlayMarker(
          match,
          markerSize,
          'pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--app-highlight-color-rgb)/0.4)] ring-1 ring-[color:rgb(var(--app-highlight-color-rgb)/0.5)]',
          'pdf-search-match-weak'
        )
      )}
      {activeSearchMatch
        ? renderPdfOverlayRects(
            activeSearchMatch,
            'pointer-events-none absolute z-30 rounded-[2px] bg-[color:rgb(var(--app-highlight-color-rgb)/0.7)] ring-2 ring-[color:rgb(var(--app-highlight-color-rgb)/0.92)]',
            'pdf-search-match-active'
          ) ??
          renderPdfOverlayMarker(
            activeSearchMatch,
            markerSize,
            'pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--app-highlight-color-rgb)/0.86)] ring-2 ring-[color:rgb(var(--app-highlight-color-rgb)/0.96)]',
            'pdf-search-match-active'
          )
        : null}
    </>
  );
}

function stripTextLayerInlineFonts(page: HTMLDivElement | null) {
  if (!page) {
    return;
  }
  const spans = page.querySelectorAll<HTMLSpanElement>('.textLayer span');
  for (const span of spans) {
    span.style.fontFamily = '';
  }
}

function renderSelectionOverlay(
  selectionLocator: { id: string; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | null,
  markerSize: number
) {
  if (!selectionLocator) {
    return null;
  }
  return (
    renderPdfOverlayRects(
      selectionLocator,
      'pointer-events-none absolute z-20 rounded-[3px] bg-[var(--app-selection-surface-color)] ring-1 ring-[var(--app-selection-surface-color)]',
      'pdf-selection-rect'
    ) ??
    renderPdfOverlayMarker(
      selectionLocator,
      markerSize,
      'pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--app-selection-surface-color)] shadow-sm ring-1 ring-[var(--app-selection-surface-color)]',
      'pdf-selection-marker'
    )
  );
}
