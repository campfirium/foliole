import { useEffect, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import type { PdfSearchStatus, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { PdfViewportDocument, PdfViewportToolbar } from './PdfDocumentViewportRenderParts';
import type { PdfPageTextEntry } from './pdfPageText';

interface PdfDocumentViewportContentBodyProps {
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  isToolbarVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
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
  onTextLayerRender: (pageNumber: number) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  searchIndexingHint: string | null;
  searchHighlights: PdfSearchVisualHighlight[];
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

function useFitWidthTargetWidth(scrollContainerRef: MutableRefObject<HTMLDivElement | null>) {
  const [targetWidth, setTargetWidth] = useState<number | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const updateTargetWidth = () => {
      setTargetWidth(container.clientWidth > 48 ? Math.max(160, container.clientWidth - 48) : null);
    };
    updateTargetWidth();
    window.addEventListener('resize', updateTargetWidth);
    return () => window.removeEventListener('resize', updateTargetWidth);
  }, [scrollContainerRef]);

  return targetWidth;
}

function useDisplayedPdfZoom(args: {
  fitWidthTargetWidth: number | null;
  page: number;
  zoom: number;
  zoomMode: 'custom' | 'fit-width';
}) {
  const [baseWidthByPage, setBaseWidthByPage] = useState<Record<number, number>>({});
  const displayedZoom =
    args.zoomMode === 'fit-width' && args.fitWidthTargetWidth && baseWidthByPage[args.page]
      ? Math.max(1, Math.round((args.fitWidthTargetWidth / baseWidthByPage[args.page]) * 100))
      : args.zoom;

  const handlePageLoadSuccess = (pageNumber: number, baseWidth: number) => {
    setBaseWidthByPage((current) => (current[pageNumber] === baseWidth ? current : { ...current, [pageNumber]: baseWidth }));
  };

  return { displayedZoom, handlePageLoadSuccess };
}

export function PdfDocumentViewportContentBody(props: PdfDocumentViewportContentBodyProps) {
  const fitWidthTargetWidth = useFitWidthTargetWidth(props.scrollContainerRef);
  const { displayedZoom, handlePageLoadSuccess } = useDisplayedPdfZoom({
    fitWidthTargetWidth,
    page: props.page,
    zoom: props.zoom,
    zoomMode: props.zoomMode
  });

  return (
    <div
      className="app-scrollbar flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-auto px-2 pb-5"
      onContextMenu={props.handleContextMenu}
      onScroll={props.handleScroll}
      data-testid="pdf-scroll-container"
      ref={props.scrollContainerRef}
    >
      <PdfViewportToolbar
        isVisible={props.isToolbarVisible}
        maxPage={props.maxPage}
        onClearSearch={props.onClearSearch}
        onNextPage={props.onNextPage}
        onPageChange={props.onPageChange}
        onPreviousPage={props.onPreviousPage}
        onRotateClockwise={props.onRotateClockwise}
        onSearchFocusChange={props.onSearchFocusChange}
        searchIndexingHint={props.searchIndexingHint}
        onSearchQueryChange={props.onSearchQueryChange}
        onSearchRequest={props.onSearchRequest}
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
        zoom={displayedZoom}
      />
      <PdfViewportDocument
        fitWidthTargetWidth={fitWidthTargetWidth}
        highlightLocators={props.highlightLocators}
        onLoadError={props.onLoadError}
        onLoadSuccess={props.onLoadSuccess}
        onPageLoadSuccess={handlePageLoadSuccess}
        onTextContentLoad={props.onTextContentLoad}
        onTextLayerRender={props.onTextLayerRender}
        pageElementsRef={props.pageElementsRef}
        pdfSelectionLocator={props.pdfSelectionLocator}
        pdfSource={props.pdfSource}
        rotation={props.rotation}
        searchHighlights={props.searchHighlights}
        totalPages={props.totalPages}
        zoomMode={props.zoomMode}
        zoom={props.zoom}
      />
    </div>
  );
}
