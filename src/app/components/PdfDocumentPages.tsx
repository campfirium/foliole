import type { PdfSelectionLocator } from '../../features/nodes/model/nodeTypes';
import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageDimensions } from './pdfPageDimensions';
import type { PdfPageTextEntry } from './pdfPageText';
import { usePdfSelectedPageNumbers } from './pdfSelectionPages';
import { renderDocumentPages } from './pdfViewportPageLayout';
import { resolveRenderablePageNumbers } from './pdfViewportPageNumbers';

export function PdfDocumentPages({
  fitWidthTargetWidth,
  highlightLocators,
  onPageRenderReady,
  onTextContentLoad,
  onTextLayerRender,
  onPageLoadSuccess,
  pageJumpRequest,
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
  const retainedPageNumbers = usePdfSelectedPageNumbers(pageElementsRef);
  if (!totalPages) {
    return null;
  }
  const pageNumbers = resolveRenderablePageNumbers({
    highlightLocators,
    page: visiblePage,
    pendingPage: pageJumpRequest?.page,
    retainedPageNumbers,
    pdfSelectionLocator,
    searchHighlights,
    searchQuery,
    totalPages
  });
  const canvasPageNumbers = resolveRenderablePageNumbers({
    highlightLocators, page: visiblePage, pendingPage: pageJumpRequest?.page,
    pdfSelectionLocator: undefined, searchHighlights, searchQuery, totalPages
  });
  return renderDocumentPages(totalPages, pageNumbers, {
    canvasPageNumbers,
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
  pageJumpRequest: PdfJumpRequest | null;
  pageDimensionsByNumber: Record<number, PdfPageDimensions>;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: PdfSelectionLocator | undefined;
  rotation: number;
  searchQuery: string;
  searchHighlights: PdfSearchVisualHighlight[];
  totalPages: number | null;
  visiblePage: number;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}
