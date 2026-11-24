import { useEffect, useState, type MutableRefObject } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import { searchRuntimePdfDocument, type RuntimePdfDocumentSearchMatch } from '../../shared/platform/desktop/pdfDocumentSearchRuntimeRepository';

import { usePdfSearchEffect, type PdfSearchDebugInfo, type PdfSearchRequest, type PdfSearchStatus, type PdfSearchTarget, type PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';

export interface PdfDocumentViewportSearchRuntimeProps {
  nodeId: string | null;
  positionReady?: boolean;
  onSearchPosition?: ((page: number, positionY: number) => void) | undefined;
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
    ...definedProps({ onSearchPosition: props.onSearchPosition }),
    positionReady: props.positionReady ?? true,
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

const NO_MATCHES: RuntimePdfDocumentSearchMatch[] = [];

function usePdfDocumentSearchMatches(
  nodeId: string | null,
  pdfIndexStatus: PdfDocumentViewportSearchRuntimeProps['pdfIndexStatus'],
  query: string
) {
  const [result, setResult] = useState<{
    nodeId: string;
    query: string;
    matches: RuntimePdfDocumentSearchMatch[];
  } | null>(null);

  useEffect(() => {
    setResult(null);
    if (!nodeId || !query.trim() || pdfIndexStatus !== 'ready') return;
    let disposed = false;
    void searchRuntimePdfDocument(nodeId, query).then((response) => {
      if (!disposed && response?.status === 'ready') {
        setResult({ nodeId, query, matches: response.matches });
      }
    });
    return () => {
      disposed = true;
    };
  }, [nodeId, pdfIndexStatus, query]);

  return pdfIndexStatus === 'ready' && result?.nodeId === nodeId && result.query === query
    ? result.matches
    : NO_MATCHES;
}
