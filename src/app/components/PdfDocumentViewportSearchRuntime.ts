import type { MutableRefObject } from 'react';

import { usePdfSearchEffect, type PdfSearchDebugInfo, type PdfSearchRequest, type PdfSearchStatus, type PdfSearchTarget, type PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';

export interface PdfDocumentViewportSearchRuntimeProps {
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  onSearchRequestHandled: (requestId: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onSearchTargetHandled: (targetId: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchRevision: number;
  searchTarget: PdfSearchTarget | null;
  totalPages: number | null;
}

export function usePdfDocumentViewportSearchRuntime(props: PdfDocumentViewportSearchRuntimeProps) {
  usePdfSearchEffect({
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
