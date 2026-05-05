import { memo } from 'react';
import { Page } from 'react-pdf';

import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { renderPdfOverlayMarker, renderPdfOverlayRects, resolvePdfOverlayMarkerSize } from './pdfOverlayRender';
import { resolvePageText, type PdfPageTextEntry } from './pdfPageText';

interface PdfPageRenderLocator {
  id: string;
  page: number;
  rects?: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

interface RenderPdfPageArgs {
  highlightLocators: PdfPageRenderLocator[];
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
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
        <PdfPageCanvas
          onTextContentLoad={args.onTextContentLoad}
          onTextLayerRender={args.onTextLayerRender}
          pageNumber={args.pageNumber}
          rotate={args.rotation}
          zoom={args.zoom}
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

const PdfPageCanvas = memo(
  function PdfPageCanvas(props: {
    onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
    onTextLayerRender: (pageNumber: number) => void;
    pageNumber: number;
    rotate: number;
    zoom?: number;
  }) {
    return (
      <Page
        className="mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-sm"
        data-testid="pdf-document-page"
        onGetTextSuccess={(textContent: unknown) => {
          props.onTextContentLoad(props.pageNumber, resolvePageText(textContent));
        }}
        onRenderTextLayerSuccess={() => {
          props.onTextLayerRender(props.pageNumber);
        }}
        pageNumber={props.pageNumber}
        renderAnnotationLayer
        renderTextLayer
        rotate={props.rotate}
        scale={(props.zoom ?? 100) / 100}
      />
    );
  },
  (previous, next) => previous.pageNumber === next.pageNumber && previous.rotate === next.rotate && previous.zoom === next.zoom
);

function renderSearchHighlightsOnPage(pageSearchHighlights: PdfSearchVisualHighlight[], markerSize: number) {
  return (
    <>
      {pageSearchHighlights.map((match) =>
        renderPdfOverlayRects(
          match,
          match.isActive
            ? 'pointer-events-none absolute z-30 rounded-[2px] bg-[color:rgb(var(--app-highlight-color-rgb)/0.7)] ring-2 ring-[color:rgb(var(--app-highlight-color-rgb)/0.92)]'
            : 'pointer-events-none absolute z-20 rounded-[2px] bg-[color:rgb(var(--app-highlight-color-rgb)/0.3)] ring-1 ring-[color:rgb(var(--app-highlight-color-rgb)/0.5)]',
          match.isActive ? 'pdf-search-match-active' : 'pdf-search-match-weak'
        ) ??
        renderPdfOverlayMarker(
          match,
          markerSize,
          match.isActive
            ? 'pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--app-highlight-color-rgb)/0.86)] ring-2 ring-[color:rgb(var(--app-highlight-color-rgb)/0.96)]'
            : 'pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--app-highlight-color-rgb)/0.4)] ring-1 ring-[color:rgb(var(--app-highlight-color-rgb)/0.5)]',
          match.isActive ? 'pdf-search-match-active' : 'pdf-search-match-weak'
        )
      )}
    </>
  );
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
