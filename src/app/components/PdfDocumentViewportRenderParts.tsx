import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Document } from 'react-pdf';

import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageDimensions } from './pdfPageDimensions';
import type { PdfPageTextEntry } from './pdfPageText';
import { collectPdfPageDimensions, renderDocumentPages } from './pdfViewportPageLayout';
import { resolveRenderablePageNumbers } from './pdfViewportPageNumbers';
import { PdfViewportPlaceholderStack } from './pdfViewportPlaceholderStack';
import { usePdfInitialRenderReadyState } from './usePdfInitialRenderReadyState';

interface PdfViewportDocumentProps {
  fitWidthTargetWidth: number | null;
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onInitialRenderReadyChange: (ready: boolean) => void;
  onLayoutReadyChange: (ready: boolean) => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchQuery: string;
  searchHighlights: PdfSearchVisualHighlight[];
  totalPages: number | null;
  visiblePage: number;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

export function PdfViewportDocument(props: PdfViewportDocumentProps) {
  const persistedPageDimensions = props.persistedPageDimensions ?? {};
  const [pageDimensionsByNumber, setPageDimensionsByNumber] = useState<Record<number, PdfPageDimensions>>(persistedPageDimensions);
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);
  const { handlePageRenderReady } = usePdfInitialRenderReadyState(props);
  const totalPages = props.totalPages ?? props.persistedPageCount;
  const totalPageCount = totalPages ?? 0;
  const hasCompletePageMetrics = totalPageCount > 0 && Object.keys(pageDimensionsByNumber).length >= totalPageCount;
  const isLayoutReady = isDocumentLoaded && hasCompletePageMetrics;
  const persistedPageDimensionsKey = Object.entries(persistedPageDimensions)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([pageNumber, dimensions]) => `${pageNumber}:${dimensions.width}x${dimensions.height}`)
    .join('|');
  const previousPdfSourceRef = useRef(props.pdfSource);
  const previousPersistedPageDimensionsKeyRef = useRef(persistedPageDimensionsKey);

  useEffect(() => {
    if (
      previousPdfSourceRef.current === props.pdfSource &&
      previousPersistedPageDimensionsKeyRef.current === persistedPageDimensionsKey
    ) {
      return;
    }
    previousPdfSourceRef.current = props.pdfSource;
    previousPersistedPageDimensionsKeyRef.current = persistedPageDimensionsKey;
    setPageDimensionsByNumber(persistedPageDimensions);
    setIsDocumentLoaded(false);
  }, [persistedPageDimensionsKey, props.pdfSource]);

  useEffect(() => {
    props.onLayoutReadyChange(isLayoutReady);
  }, [isLayoutReady, props.onLayoutReadyChange]);

  return renderPdfDocument(
    props,
    handlePageRenderReady,
    pageDimensionsByNumber,
    isLayoutReady,
    hasCompletePageMetrics,
    setIsDocumentLoaded,
    setPageDimensionsByNumber
  );
}
function renderPdfDocument(
  props: PdfViewportDocumentProps,
  handlePageRenderReady: (pageNumber: number) => void,
  pageDimensionsByNumber: Record<number, PdfPageDimensions>,
  isLayoutReady: boolean,
  hasCompletePageMetrics: boolean,
  setIsDocumentLoaded: Dispatch<SetStateAction<boolean>>,
  setPageDimensionsByNumber: Dispatch<SetStateAction<Record<number, PdfPageDimensions>>>
) {
  const handleDocumentLoadSuccess = createDocumentLoadSuccessHandler(props, setIsDocumentLoaded, setPageDimensionsByNumber);
  const handlePageLoadSuccess = createPageLoadSuccessHandler(props, setPageDimensionsByNumber);

  return (
    <>
      {hasCompletePageMetrics && !isLayoutReady ? (
        <PdfViewportPlaceholderStack
          fitWidthTargetWidth={props.fitWidthTargetWidth}
          pageDimensionsByNumber={pageDimensionsByNumber}
          pageElementsRef={props.pageElementsRef}
          persistedPageCount={props.persistedPageCount}
          rotation={props.rotation}
          totalPages={props.totalPages}
          zoomMode={props.zoomMode}
          zoom={props.zoom}
        />
      ) : null}
      <Document
        className={isLayoutReady ? 'mx-auto flex w-full max-w-none flex-col items-center gap-4' : 'hidden'}
        data-testid="pdf-document-view"
        file={props.pdfSource}
        loading={null}
        noData={<p className="text-sm text-foreground/70">No PDF file selected.</p>}
        onLoadError={(error) => props.onLoadError(error.message || 'Failed to load PDF document.')}
        onLoadSuccess={handleDocumentLoadSuccess}
      >
        <PdfDocumentPages
          fitWidthTargetWidth={props.fitWidthTargetWidth}
          highlightLocators={props.highlightLocators}
          onPageRenderReady={handlePageRenderReady}
          onTextContentLoad={props.onTextContentLoad}
          onTextLayerRender={props.onTextLayerRender}
          onPageLoadSuccess={handlePageLoadSuccess}
          pageDimensionsByNumber={pageDimensionsByNumber}
          pageElementsRef={props.pageElementsRef}
          pdfSelectionLocator={props.pdfSelectionLocator}
          rotation={props.rotation}
          searchQuery={props.searchQuery}
          searchHighlights={props.searchHighlights}
          totalPages={props.totalPages}
          visiblePage={props.visiblePage}
          zoomMode={props.zoomMode}
          zoom={props.zoom}
        />
      </Document>
    </>
  );
}

function createDocumentLoadSuccessHandler(
  props: PdfViewportDocumentProps,
  setIsDocumentLoaded: Dispatch<SetStateAction<boolean>>,
  setPageDimensionsByNumber: Dispatch<SetStateAction<Record<number, PdfPageDimensions>>>
) {
  return (document: { getPage?: (pageNumber: number) => Promise<unknown>; numPages: number }) => {
    setIsDocumentLoaded(true);
    props.onLoadSuccess(document.numPages);
    if (Object.keys(props.persistedPageDimensions ?? {}).length > 0) {
      return;
    }
    void collectPdfPageDimensions(document).then((pageDimensions) => {
      setPageDimensionsByNumber(pageDimensions);
    });
  };
}

function createPageLoadSuccessHandler(
  props: PdfViewportDocumentProps,
  setPageDimensionsByNumber: Dispatch<SetStateAction<Record<number, PdfPageDimensions>>>
) {
  return (pageNumber: number, dimensions: PdfPageDimensions) => {
    props.onPageLoadSuccess(pageNumber, dimensions);
    setPageDimensionsByNumber((current) =>
      current[pageNumber]?.width === dimensions.width && current[pageNumber]?.height === dimensions.height
        ? current
        : { ...current, [pageNumber]: dimensions }
    );
  };
}
function PdfDocumentPages({
  fitWidthTargetWidth,
  highlightLocators,
  onPageRenderReady,
  onTextContentLoad,
  onTextLayerRender,
  onPageLoadSuccess,
  pageDimensionsByNumber,
  pageElementsRef,
  pdfSelectionLocator,
  rotation,
  searchQuery,
  searchHighlights,
  totalPages,
  visiblePage,
  zoomMode,
  zoom
}: PdfDocumentPagesProps) {
  if (!totalPages) {
    return null;
  }
  const pageNumbers = resolveRenderablePageNumbers({
    highlightLocators,
    page: visiblePage,
    pdfSelectionLocator,
    searchHighlights,
    searchQuery,
    totalPages
  });
  return renderDocumentPages(totalPages, pageNumbers, {
    fitWidthTargetWidth,
    highlightLocators,
    onPageRenderReady,
    onPageLoadSuccess,
    onTextContentLoad,
    onTextLayerRender,
    pageDimensionsByNumber,
    pageElementsRef,
    pdfSelectionLocator,
    rotation,
    searchHighlights,
    zoomMode,
    zoom
  });
}
interface PdfDocumentPagesProps {
  fitWidthTargetWidth: number | null;
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onPageRenderReady: (pageNumber: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
  pageDimensionsByNumber: Record<number, PdfPageDimensions>;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  rotation: number;
  searchQuery: string;
  searchHighlights: PdfSearchVisualHighlight[];
  totalPages: number | null;
  visiblePage: number;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}
