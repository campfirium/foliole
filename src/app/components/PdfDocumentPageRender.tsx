import { useState } from 'react';

import { definedProps } from '../../shared/lib/definedProps';

import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { resolvePdfOverlayMarkerSize } from './pdfOverlayRender';
import { PdfPageCanvas } from './PdfPageCanvas';
import { PdfPageCropFrame } from './PdfPageCropFrame';
import { resolveRenderedPageDimensions, type PdfPageDimensions } from './pdfPageDimensions';
import { renderPdfHighlightMarkers, renderSearchHighlightsOnPage, renderSelectionOverlay, type PdfPageOverlayLocator } from './PdfPageOverlays';
import type { PdfPageTextEntry } from './pdfPageText';
import { PdfVisualExcerptPageLayer } from './PdfVisualExcerptPageLayer';

interface RenderPdfPageArgs {
  fitWidthTargetWidth: number | null;
  highlightLocators: PdfPageOverlayLocator[];
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

interface PdfPageContentProps {
  fitWidthTargetWidth: number | null;
  handlePageRenderReady: (pageNumber: number) => void;
  markerSize: number;
  onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: () => void;
  pageDimensions?: PdfPageDimensions | null;
  pageHighlights: PdfPageOverlayLocator[];
  pageNumber: number;
  pageRef?: (element: HTMLDivElement | null) => void;
  pageSearchHighlights: PdfSearchVisualHighlight[];
  pdfSelectionLocator: { id: string; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | null;
  placeholderDimensions?: PdfPageDimensions;
  rotation: number;
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
      {...definedProps({ onPageRenderReady: args.onPageRenderReady })}
      onTextContentLoad={args.onTextContentLoad}
      onTextLayerRender={args.onTextLayerRender}
      {...definedProps({ pageDimensions: args.pageDimensions })}
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
  pageHighlights: PdfPageOverlayLocator[];
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

  const pageDimensions = props.pageDimensions ?? null;

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
      {pageDimensions
        ? renderCroppedPdfPage({ ...props, handlePageRenderReady, pageDimensions })
        : renderUncroppedPdfPage({ ...props, handlePageRenderReady, placeholderDimensions })}
    </div>
  );
}

function renderCroppedPdfPage(props: Omit<PdfPageContentProps, 'onTextLayerRender'> & {
  onTextLayerRender: (pageNumber: number) => void;
  pageDimensions: PdfPageDimensions;
}) {
  return (
    <PdfPageCropFrame pageDimensions={props.pageDimensions}>
      {({ onTextLayerRender, pageRef }) =>
        renderPdfPageContent({
          ...props,
          onTextLayerRender: () => {
            props.onTextLayerRender(props.pageNumber);
            onTextLayerRender();
          },
          pageRef
        })}
    </PdfPageCropFrame>
  );
}

function renderUncroppedPdfPage(props: Omit<PdfPageContentProps, 'onTextLayerRender'> & {
  onTextLayerRender: (pageNumber: number) => void;
  placeholderDimensions: PdfPageDimensions;
}) {
  return renderPdfPageContent({
    ...props,
    onTextLayerRender: () => props.onTextLayerRender(props.pageNumber)
  });
}

function renderPdfPageContent(props: PdfPageContentProps) {
  return (
    <div className="relative inline-block">
      {props.placeholderDimensions ? (
        <div
          aria-hidden="true"
          className="pdf-document-page-placeholder absolute inset-0 rounded-sm bg-bg-panel/20 shadow-page"
          style={{ height: props.placeholderDimensions.height, width: props.placeholderDimensions.width }}
        />
      ) : null}
      <PdfPageCanvas
        fitWidthTargetWidth={props.fitWidthTargetWidth}
        onPageLoadSuccess={props.onPageLoadSuccess}
        onPageRenderReady={props.handlePageRenderReady}
        onTextContentLoad={props.onTextContentLoad}
        onTextLayerRender={props.onTextLayerRender}
        {...definedProps({ pageDimensions: props.pageDimensions, pageRef: props.pageRef })}
        pageNumber={props.pageNumber}
        rotate={props.rotation}
        zoomMode={props.zoomMode}
        zoom={props.zoom}
      />
      {renderPdfHighlightMarkers(props.pageHighlights, props.markerSize)}
      {renderSearchHighlightsOnPage(props.pageNumber, props.pageSearchHighlights, props.markerSize)}
      {renderSelectionOverlay(props.pdfSelectionLocator, props.markerSize)}
      <PdfVisualExcerptPageLayer pageNumber={props.pageNumber} />
    </div>
  );
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
      <div aria-hidden="true" className="pdf-document-page-placeholder rounded-sm bg-bg-panel/20 shadow-page" style={{ height, width }} />
    </div>
  );
}
