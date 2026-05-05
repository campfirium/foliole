import { useEffect, useRef, useState } from 'react';

import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { resolveInitialReadyPageNumbers } from './pdfViewportPageNumbers';

interface UsePdfInitialRenderReadyStateArgs {
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onInitialRenderReadyChange: (ready: boolean) => void;
  page: number;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  searchHighlights: PdfSearchVisualHighlight[];
  searchQuery: string;
  totalPages: number | null;
}

export function usePdfInitialRenderReadyState(args: UsePdfInitialRenderReadyStateArgs) {
  const expectedPageNumbers = args.totalPages
    ? resolveInitialReadyPageNumbers({
        highlightLocators: args.highlightLocators,
        page: args.page,
        pdfSelectionLocator: args.pdfSelectionLocator,
        searchHighlights: args.searchHighlights,
        searchQuery: args.searchQuery,
        totalPages: args.totalPages
      })
    : [];
  const [readyPageNumbers, setReadyPageNumbers] = useState<Record<number, true>>({});
  const [isInitialRenderReady, setIsInitialRenderReady] = useState(false);
  const previousPdfSourceRef = useRef(args.pdfSource);

  useEffect(() => {
    if (previousPdfSourceRef.current === args.pdfSource) {
      return;
    }
    previousPdfSourceRef.current = args.pdfSource;
    setReadyPageNumbers({});
    setIsInitialRenderReady(false);
  }, [args.pdfSource]);

  useEffect(() => {
    if (!isInitialRenderReady && expectedPageNumbers.length > 0 && expectedPageNumbers.every((pageNumber) => readyPageNumbers[pageNumber])) {
      setIsInitialRenderReady(true);
    }
  }, [expectedPageNumbers, isInitialRenderReady, readyPageNumbers]);

  useEffect(() => {
    args.onInitialRenderReadyChange(isInitialRenderReady);
  }, [args.onInitialRenderReadyChange, isInitialRenderReady]);

  return {
    handlePageRenderReady: (pageNumber: number) => {
      setReadyPageNumbers((current) => (current[pageNumber] ? current : { ...current, [pageNumber]: true }));
    }
  };
}
