import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { renderPdfOverlayMarker, renderPdfOverlayRects } from './pdfOverlayRender';

export interface PdfPageOverlayLocator {
  id: string;
  page: number;
  rects?: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

export function renderPdfHighlightMarkers(pageHighlights: PdfPageOverlayLocator[], markerSize: number) {
  return pageHighlights.map((locator) => {
    const highlightRects = renderPdfOverlayRects(locator);
    return highlightRects ?? renderPdfOverlayMarker(locator, markerSize);
  });
}

export function renderSearchHighlightsOnPage(pageNumber: number, pageSearchHighlights: PdfSearchVisualHighlight[], markerSize: number) {
  const pageFragments = pageSearchHighlights.flatMap((match) => {
    const fragments = match.fragments?.length
      ? match.fragments
      : [{ page: match.page, rects: match.rects, x: match.x, y: match.y }];
    return fragments
      .filter((fragment) => fragment.page === pageNumber)
      .map((fragment, index) => ({
        id: `${match.id}:${fragment.page}:${index}`,
        isActive: match.isActive,
        rects: fragment.rects,
        x: fragment.x,
        y: fragment.y
      }));
  });
  return (
    <>
      {pageFragments.map((match) =>
        renderPdfOverlayRects(
          match,
          match.isActive
            ? 'pointer-events-none absolute z-surface-raised rounded-[2px] bg-[color:rgb(var(--app-highlight-color-rgb)/0.7)] ring-2 ring-[color:rgb(var(--app-highlight-color-rgb)/0.92)]'
            : 'pointer-events-none absolute z-surface-overlay rounded-[2px] bg-[color:rgb(var(--app-highlight-color-rgb)/0.3)] ring-1 ring-[color:rgb(var(--app-highlight-color-rgb)/0.5)]',
          match.isActive ? 'pdf-search-match-active' : 'pdf-search-match-weak'
        ) ??
        renderPdfOverlayMarker(
          match,
          markerSize,
          match.isActive
            ? 'pointer-events-none absolute z-surface-raised -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--app-highlight-color-rgb)/0.86)] ring-2 ring-[color:rgb(var(--app-highlight-color-rgb)/0.96)]'
            : 'pointer-events-none absolute z-surface-overlay -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--app-highlight-color-rgb)/0.4)] ring-1 ring-[color:rgb(var(--app-highlight-color-rgb)/0.5)]',
          match.isActive ? 'pdf-search-match-active' : 'pdf-search-match-weak'
        )
      )}
    </>
  );
}

export function renderSelectionOverlay(
  selectionLocator: { id: string; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | null,
  markerSize: number
) {
  if (!selectionLocator) {
    return null;
  }
  return (
    renderPdfOverlayRects(
      selectionLocator,
      'pointer-events-none absolute z-surface-overlay rounded-[3px] bg-[var(--app-selection-surface-color)] ring-1 ring-[var(--app-selection-surface-color)]',
      'pdf-selection-rect'
    ) ??
    renderPdfOverlayMarker(
      selectionLocator,
      markerSize,
      'pointer-events-none absolute z-surface-overlay -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--app-selection-surface-color)] shadow-marker ring-1 ring-[var(--app-selection-surface-color)]',
      'pdf-selection-marker'
    )
  );
}
