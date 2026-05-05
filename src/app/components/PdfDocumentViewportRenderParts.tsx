import { useEffect, useRef, useState } from 'react';
import { Document } from 'react-pdf';

import { renderPdfPage } from './PdfDocumentPageRender';
import type { PdfSearchStatus, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { PdfDocumentToolbar } from './PdfDocumentToolbar';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';
import { resolveInitialReadyPageNumbers, resolveRenderablePageNumbers } from './pdfViewportPageNumbers';

interface PdfViewportToolbarProps {
  isVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

export function PdfViewportToolbar(props: PdfViewportToolbarProps) {
  return (
    <PdfDocumentToolbar
      isVisible={props.isVisible}
      maxPage={props.maxPage}
      onClearSearch={props.onClearSearch}
      onFindNext={() => props.onSearchRequest('next')}
      onFindPrevious={() => props.onSearchRequest('previous')}
      onNextPage={props.onNextPage}
      onPageChange={props.onPageChange}
      onPreviousPage={props.onPreviousPage}
      onRotateClockwise={props.onRotateClockwise}
      onSearchFocusChange={props.onSearchFocusChange}
      searchIndexingHint={props.searchIndexingHint}
      onSearchQueryChange={props.onSearchQueryChange}
      onSetFitWidth={props.onSetFitWidth}
      onSetZoom={props.onSetZoom}
      onToolbarActiveChange={props.onToolbarActiveChange}
      onToolbarInteraction={props.onToolbarInteraction}
      onZoomIn={props.onZoomIn}
      onZoomOut={props.onZoomOut}
      page={props.page}
      searchQuery={props.searchQuery}
      searchStatus={props.searchStatus}
      zoomMode={props.zoomMode}
      zoom={props.zoom}
    />
  );
}

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
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onPageLoadSuccess: (pageNumber: number, baseWidth: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchQuery: string;
  searchHighlights: PdfSearchVisualHighlight[];
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

export function PdfViewportDocument(props: PdfViewportDocumentProps) {
  const { handlePageRenderReady } = usePdfInitialRenderReadyState(props);
  return renderPdfDocument(props, handlePageRenderReady);
}
function usePdfInitialRenderReadyState(props: PdfViewportDocumentProps) {
  const expectedPageNumbers = props.totalPages
    ? resolveInitialReadyPageNumbers({
        highlightLocators: props.highlightLocators,
        page: props.page,
        pdfSelectionLocator: props.pdfSelectionLocator,
        searchHighlights: props.searchHighlights,
        searchQuery: props.searchQuery,
        totalPages: props.totalPages
      })
    : [];
  const [readyPageNumbers, setReadyPageNumbers] = useState<Record<number, true>>({});
  const [isInitialRenderReady, setIsInitialRenderReady] = useState(false);
  const previousPdfSourceRef = useRef(props.pdfSource);
  useEffect(() => {
    if (previousPdfSourceRef.current === props.pdfSource) {
      return;
    }
    previousPdfSourceRef.current = props.pdfSource;
    setReadyPageNumbers({});
    setIsInitialRenderReady(false);
  }, [props.pdfSource]);

  useEffect(() => {
    if (!isInitialRenderReady && expectedPageNumbers.length > 0 && expectedPageNumbers.every((pageNumber) => readyPageNumbers[pageNumber])) setIsInitialRenderReady(true);
  }, [expectedPageNumbers, isInitialRenderReady, readyPageNumbers]);
  useEffect(() => {
    props.onInitialRenderReadyChange(isInitialRenderReady);
  }, [isInitialRenderReady, props.onInitialRenderReadyChange]);
  return {
    handlePageRenderReady: (pageNumber: number) => {
      setReadyPageNumbers((current) => (current[pageNumber] ? current : { ...current, [pageNumber]: true }));
    }
  };
}
function renderPdfDocument(props: PdfViewportDocumentProps, handlePageRenderReady: (pageNumber: number) => void) {
  return (
    <Document
      className="mx-auto flex w-full max-w-none flex-col items-center gap-4"
      data-testid="pdf-document-view"
      file={props.pdfSource}
      loading={<div aria-hidden="true" className="min-h-[360px] w-full rounded-md bg-bg-panel/20" />}
      noData={<p className="text-sm text-foreground/70">No PDF file selected.</p>}
      onLoadError={(error) => props.onLoadError(error.message || 'Failed to load PDF document.')}
      onLoadSuccess={({ numPages }: { numPages: number }) => props.onLoadSuccess(numPages)}
    >
      <PdfDocumentPages
        highlightLocators={props.highlightLocators}
        onPageRenderReady={handlePageRenderReady}
        onTextContentLoad={props.onTextContentLoad}
        onTextLayerRender={props.onTextLayerRender}
        onPageLoadSuccess={props.onPageLoadSuccess}
        page={props.page}
        pageElementsRef={props.pageElementsRef}
        pdfSelectionLocator={props.pdfSelectionLocator}
        fitWidthTargetWidth={props.fitWidthTargetWidth}
        rotation={props.rotation}
        searchQuery={props.searchQuery}
        searchHighlights={props.searchHighlights}
        totalPages={props.totalPages}
        zoomMode={props.zoomMode}
        zoom={props.zoom}
      />
    </Document>
  );
}
function PdfDocumentPages({
  highlightLocators,
  onPageRenderReady,
  onTextContentLoad,
  onTextLayerRender,
  onPageLoadSuccess,
  page,
  pageElementsRef,
  pdfSelectionLocator,
  fitWidthTargetWidth,
  rotation,
  searchQuery,
  searchHighlights,
  totalPages,
  zoomMode,
  zoom
}: PdfDocumentPagesProps) {
  if (!totalPages) {
    return null;
  }
  const pageNumbers = resolveRenderablePageNumbers({
    highlightLocators,
    page,
    pdfSelectionLocator,
    searchHighlights,
    searchQuery,
    totalPages
  });
  return renderRenderablePages(pageNumbers, {
    fitWidthTargetWidth,
    highlightLocators,
    onPageRenderReady,
    onPageLoadSuccess,
    onTextContentLoad,
    onTextLayerRender,
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
  onPageLoadSuccess: (pageNumber: number, baseWidth: number) => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  rotation: number;
  searchQuery: string;
  searchHighlights: PdfSearchVisualHighlight[];
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}
function renderRenderablePages(pageNumbers: number[], args: Omit<Parameters<typeof renderPdfPage>[0], 'pageNumber'>) {
  return pageNumbers.map((pageNumber) => renderPdfPage({ ...args, pageNumber }));
}
