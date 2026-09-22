import { useEffect, useState, type MutableRefObject } from 'react';

import { searchRuntimePdfDocument, type RuntimePdfDocumentSearchMatch } from '../../shared/platform/desktop/pdfDocumentSearchRuntimeRepository';

import { usePdfSearchEffect, type PdfSearchDebugInfo, type PdfSearchRequest, type PdfSearchStatus, type PdfSearchTarget, type PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';

export interface PdfDocumentViewportSearchRuntimeProps {
  nodeId: string | null;
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  onSearchRequestHandled: (requestId: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onSearchTargetHandled: (targetId: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  pdfIndexStatus: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchRevision: number;
  searchTarget: PdfSearchTarget | null;
  totalPages: number | null;
}

export function usePdfDocumentViewportSearchRuntime(props: PdfDocumentViewportSearchRuntimeProps) {
  const matches = usePdfDocumentSearchMatches(props.nodeId, props.pdfIndexStatus, props.searchQuery);
  usePdfSearchEffect({
    matches,
    onSearchDebugChange: props.onSearchDebugChange,
    onSearchHighlightsChange: props.onSearchHighlightsChange,
    onSearchRequestHandled: props.onSearchRequestHandled,
    onSearchStatusChange: props.onSearchStatusChange,
    onSearchTargetHandled: props.onSearchTargetHandled,
    pageElementsRef: props.pageElementsRef,
    pageTextByNumberRef: props.pageTextByNumberRef,
    scrollContainerRef: props.scrollContainerRef,
    searchQuery: props.searchQuery,
    searchRequest: props.searchRequest,
    searchRevision: props.searchRevision,
    searchTarget: props.searchTarget,
    totalPages: props.totalPages
  });
}

function usePdfDocumentSearchMatches(
  nodeId: string | null,
  pdfIndexStatus: PdfDocumentViewportSearchRuntimeProps['pdfIndexStatus'],
  query: string
) {
  const [matches, setMatches] = useState<RuntimePdfDocumentSearchMatch[]>([]);

  useEffect(() => {
    if (!nodeId || !query.trim() || pdfIndexStatus !== 'ready') {
      setMatches([]);
      return;
    }
    let disposed = false;
    setMatches([]);
    void searchRuntimePdfDocument(nodeId, query).then((result) => {
      if (!disposed) setMatches(result?.status === 'ready' ? result.matches : []);
    });
    return () => {
      disposed = true;
    };
  }, [nodeId, pdfIndexStatus, query]);

  return matches;
}
