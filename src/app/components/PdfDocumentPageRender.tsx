import { memo, useState } from 'react';
import { Page } from 'react-pdf';

import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { renderPdfOverlayMarker, renderPdfOverlayRects, resolvePdfOverlayMarkerSize } from './pdfOverlayRender';
import { resolvePdfPageDimensions, resolveRenderedPageDimensions, type PdfPageDimensions } from './pdfPageDimensions';
import { resolvePageText, type PdfPageTextEntry } from './pdfPageText';

interface PdfPageRenderLocator {
  id: string;
  page: number;
  rects?: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

interface RenderPdfPageArgs {
  fitWidthTargetWidth: number | null;
  highlightLocators: PdfPageRenderLocator[];
  onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
  onPageRenderReady?: (pageNumber: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pageNumber: number;
  pageDimensions?: PdfPageDimensions | null;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  rotation: number;
  searchHighlights: PdfSearchVisualHighlight[];
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

export function renderPdfPage(args: RenderPdfPageArgs) {
  const pageHighlights = args.highlightLocators.filter((locator) => locator.page === args.pageNumber);
  const pageSearchHighlights = args.searchHighlights.filter((highlight) => {
    if (highlight.page === args.pageNumber) {
      return true;
    }
    return highlight.fragments?.some((fragment) => fragment.page === args.pageNumber) ?? false;
  });
  const markerSize = resolvePdfOverlayMarkerSize(args.zoom);
  const selectionLocator = args.pdfSelectionLocator?.page === args.pageNumber ? { ...args.pdfSelectionLocator, id: 'pdf-selection-overlay' } : null;
  return (
    <PdfPageShell
      fitWidthTargetWidth={args.fitWidthTargetWidth}
      key={args.pageNumber}
      markerSize={markerSize}
      onPageLoadSuccess={args.onPageLoadSuccess}
      onPageRenderReady={args.onPageRenderReady}
      onTextContentLoad={args.onTextContentLoad}
      onTextLayerRender={args.onTextLayerRender}
      pageDimensions={args.pageDimensions}
      pageElementsRef={args.pageElementsRef}
      pageHighlights={pageHighlights}
      pageNumber={args.pageNumber}
      pageSearchHighlights={pageSearchHighlights}
      pdfSelectionLocator={selectionLocator}
      rotation={args.rotation}
      zoomMode={args.zoomMode}
      zoom={args.zoom}
    />
  );
}

function PdfPageShell(props: {
  fitWidthTargetWidth: number | null;
  markerSize: number;
  onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
  onPageRenderReady?: (pageNumber: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  pageDimensions?: PdfPageDimensions | null;
  pageElementsRef: PdfPageElementsRef;
  pageHighlights: PdfPageRenderLocator[];
  pageNumber: number;
  pageSearchHighlights: PdfSearchVisualHighlight[];
  pdfSelectionLocator: { id: string; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | null;
  rotation: number;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}) {
  const [isRendered, setIsRendered] = useState(false);
  const placeholderDimensions = resolveRenderedPageDimensions(props.pageDimensions, props.fitWidthTargetWidth, props.rotation, props.zoomMode, props.zoom);
  const handlePageRenderReady = (pageNumber: number) => {
    setIsRendered(true);
    props.onPageRenderReady?.(pageNumber);
  };

  return (
    <div
      className="relative flex w-full justify-center px-4"
      data-pdf-page-number={props.pageNumber}
      data-pdf-page-state={isRendered ? 'ready' : 'loading'}
      data-testid="pdf-document-page-shell"
      ref={(element) => {
        props.pageElementsRef.current[props.pageNumber] = element;
      }}
    >
      <div className="relative inline-block">
        {!isRendered ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-sm bg-bg-panel/20 shadow-sm"
            style={{ height: placeholderDimensions.height, width: placeholderDimensions.width }}
          />
        ) : null}
        <PdfPageCanvas
          fitWidthTargetWidth={props.fitWidthTargetWidth}
          onPageLoadSuccess={props.onPageLoadSuccess}
          onPageRenderReady={handlePageRenderReady}
          onTextContentLoad={props.onTextContentLoad}
          onTextLayerRender={props.onTextLayerRender}
          pageDimensions={props.pageDimensions}
          pageNumber={props.pageNumber}
          rotate={props.rotation}
          zoomMode={props.zoomMode}
          zoom={props.zoom}
        />
        {renderPdfHighlightMarkers(props.pageHighlights, props.markerSize)}
        {renderSearchHighlightsOnPage(props.pageNumber, props.pageSearchHighlights, props.markerSize)}
        {renderSelectionOverlay(props.pdfSelectionLocator, props.markerSize)}
      </div>
    </div>
  );
}

function renderPdfHighlightMarkers(pageHighlights: PdfPageRenderLocator[], markerSize: number) {
  return pageHighlights.map((locator) => {
    const highlightRects = renderPdfOverlayRects(locator);
    return highlightRects ?? renderPdfOverlayMarker(locator, markerSize);
  });
}

export function renderPdfPagePlaceholder(
  args: Pick<
    RenderPdfPageArgs,
    'fitWidthTargetWidth' | 'pageDimensions' | 'pageElementsRef' | 'pageNumber' | 'rotation' | 'zoomMode' | 'zoom'
  >
) {
  const { height, width } = resolveRenderedPageDimensions(args.pageDimensions, args.fitWidthTargetWidth, args.rotation, args.zoomMode, args.zoom);

  return (
    <div
      className="relative flex w-full justify-center px-4"
      data-pdf-page-number={args.pageNumber}
      data-pdf-page-state="placeholder"
      data-testid="pdf-document-page-shell"
      key={args.pageNumber}
      ref={(element) => {
        args.pageElementsRef.current[args.pageNumber] = element;
      }}
    >
      <div aria-hidden="true" className="rounded-sm bg-bg-panel/20 shadow-sm" style={{ height, width }} />
    </div>
  );
}

const PdfPageCanvas = memo(
  function PdfPageCanvas(props: {
    fitWidthTargetWidth: number | null;
    onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
    onPageRenderReady?: (pageNumber: number) => void;
    onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
    onTextLayerRender: (pageNumber: number) => void;
    pageDimensions?: PdfPageDimensions | null;
    pageNumber: number;
    rotate: number;
    zoomMode: 'custom' | 'fit-width';
    zoom?: number;
  }) {
    return (
      <Page
        className="mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-sm"
        onLoadSuccess={(page: unknown) => {
          const dimensions = resolvePdfPageDimensions(page);
          if (dimensions) {
            props.onPageLoadSuccess(props.pageNumber, dimensions);
          }
        }}
        data-testid="pdf-document-page"
        onGetTextSuccess={(textContent: unknown) => {
          props.onTextContentLoad(props.pageNumber, resolvePageText(textContent));
        }}
        loading={null}
        onRenderSuccess={() => {
          props.onPageRenderReady?.(props.pageNumber);
        }}
        onRenderTextLayerSuccess={() => {
          props.onTextLayerRender(props.pageNumber);
        }}
        pageNumber={props.pageNumber}
        renderAnnotationLayer
        renderTextLayer
        rotate={props.rotate}
        scale={props.zoomMode === 'fit-width' ? undefined : (props.zoom ?? 100) / 100}
        width={props.zoomMode === 'fit-width' ? props.fitWidthTargetWidth ?? undefined : undefined}
      />
    );
  },
  (previous, next) =>
    previous.fitWidthTargetWidth === next.fitWidthTargetWidth &&
    previous.pageNumber === next.pageNumber &&
    previous.rotate === next.rotate &&
    previous.zoom === next.zoom &&
    previous.zoomMode === next.zoomMode
);

function renderSearchHighlightsOnPage(pageNumber: number, pageSearchHighlights: PdfSearchVisualHighlight[], markerSize: number) {
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
