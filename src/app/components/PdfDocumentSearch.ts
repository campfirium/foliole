import type { MutableRefObject } from 'react';

import { definedProps } from '../../shared/lib/definedProps';

import type { PdfPageTextEntry } from './pdfPageText';
import { usePdfSearchCycleEffect } from './pdfSearchEffectHooks';

export interface PdfSearchRequest {
  direction: 'next' | 'previous';
  id: number;
}

export interface PdfSearchStatus {
  current: number;
  hasQuery: boolean;
  total: number;
}

export interface PdfSearchArgs {
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  onSearchRequestHandled?: (requestId: number) => void;
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  searchRevision: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  onSearchTargetHandled?: (targetId: number) => void;
  searchTarget: PdfSearchTarget | null;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  totalPages: number | null;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
}

export interface PdfSearchTarget {
  id: number;
  matchStart: number;
  page: number;
}

export interface PdfSearchVisualHighlight {
  fragments?: Array<{
    page: number;
    rects: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  id: string;
  isActive: boolean;
  page: number;
  rects: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

export interface PdfSearchDebugInfo {
  pages: Array<{
    hasTextLayer: boolean;
    indexedRangeCount: number;
    indexedTextLength: number;
    itemNodeCount: number;
    matchCount: number;
    page: number;
    pageTextLength: number;
    renderedRangeCount: number;
    renderedTextLength: number;
    textLayerChildCount: number;
    textLayerTextLength: number;
    route: 'indexed-pending' | 'rendered' | 'none';
  }>;
}

export { collectMatches } from './pdfSearchMatchCollection';
export function usePdfSearchEffect({
  onSearchDebugChange,
  onSearchHighlightsChange,
  onSearchRequestHandled,
  onSearchStatusChange,
  onSearchTargetHandled,
  pageElementsRef,
  pageTextByNumberRef,
  searchTarget,
  searchRevision,
  scrollContainerRef,
  searchQuery,
  searchRequest,
  totalPages
}: PdfSearchArgs) {
  usePdfSearchCycleEffect({
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchQuery,
    searchRequest,
    searchRevision,
    searchTarget,
    totalPages,
    onSearchDebugChange,
    onSearchHighlightsChange,
    onSearchStatusChange,
    ...definedProps({
      onSearchRequestHandled,
      onSearchTargetHandled
    })
  });
}
