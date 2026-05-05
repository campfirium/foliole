import { useEffect, useRef, type MutableRefObject } from 'react';

import type { PdfPageTextEntry } from './pdfPageText';
import { canScrollToMatch, resetSearchCursorState, resolveCursorByRequest, scrollToMatch, toSearchHighlights } from './pdfSearchEffectRuntime';
import { collectMatches, getLastPdfSearchDebug } from './pdfSearchMatchCollection';

export interface PdfSearchRequest {
  direction: 'next' | 'previous';
  id: number;
}

export interface PdfSearchStatus {
  current: number;
  hasQuery: boolean;
  total: number;
}

interface PdfSearchArgs {
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

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

export { collectMatches } from './pdfSearchMatchCollection';

function runPdfSearchCycle(args: {
  container: HTMLDivElement;
  cursorRef: { current: number };
  lastHandledTargetIdRef: { current: number | null };
  lastQueryRef: { current: string };
  lastRequestIdRef: { current: number | null };
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  onSearchRequestHandled?: (requestId: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onSearchTargetHandled?: (targetId: number) => void;
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  query: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  totalPages: number;
}) {
  const matches = collectMatches(args.pageElementsRef, args.totalPages, args.query, args.pageTextByNumberRef);
  args.onSearchDebugChange({ pages: getLastPdfSearchDebug() });
  if (matches.length === 0) {
    args.onSearchHighlightsChange([]);
    resetSearchCursorState(args);
    args.onSearchStatusChange({ current: 0, hasQuery: true, total: 0 });
    return;
  }

  const { handledAction, queryChanged } = resolveCursorByRequest({
    cursorRef: args.cursorRef,
    lastHandledTargetIdRef: args.lastHandledTargetIdRef,
    lastQueryRef: args.lastQueryRef,
    lastRequestIdRef: args.lastRequestIdRef,
    matches,
    query: args.query,
    searchRequest: args.searchRequest,
    searchTarget: args.searchTarget
  });
  const match = matches[args.cursorRef.current];
  if (!match) {
    args.onSearchHighlightsChange([]);
    args.onSearchStatusChange({ current: 0, hasQuery: true, total: matches.length });
    return;
  }
  const shell = args.pageElementsRef.current[match.page] ?? null;

  args.onSearchHighlightsChange(toSearchHighlights(matches, match.id));
  const targetPendingPreciseLocation = handledAction?.kind === 'target' && !canScrollToMatch(match, shell);
  if ((queryChanged || handledAction) && !targetPendingPreciseLocation) {
    scrollToMatch(args.container, match);
  }
  args.onSearchStatusChange({ current: args.cursorRef.current + 1, hasQuery: true, total: matches.length });
  if (handledAction?.kind === 'target' && !targetPendingPreciseLocation) {
    args.lastHandledTargetIdRef.current = handledAction.id;
    args.lastRequestIdRef.current = null;
    args.onSearchTargetHandled?.(handledAction.id);
  }
  if (handledAction?.kind === 'request') {
    args.onSearchRequestHandled?.(handledAction.id);
  }
}
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
  const cursorRef = useRef(0);
  const lastHandledTargetIdRef = useRef<number | null>(null);
  const lastRequestIdRef = useRef<number | null>(null);
  const lastQueryRef = useRef('');
  const onSearchDebugChangeRef = useRef(onSearchDebugChange);
  const onSearchRequestHandledRef = useRef(onSearchRequestHandled);
  const onSearchStatusChangeRef = useRef(onSearchStatusChange);
  const onSearchTargetHandledRef = useRef(onSearchTargetHandled);
  const onSearchHighlightsChangeRef = useRef(onSearchHighlightsChange);

  useUpdateSearchEffectCallbackRef(onSearchDebugChangeRef, onSearchDebugChange);
  useUpdateSearchEffectCallbackRef(onSearchHighlightsChangeRef, onSearchHighlightsChange);
  useUpdateSearchEffectCallbackRef(onSearchRequestHandledRef, onSearchRequestHandled);
  useUpdateSearchEffectCallbackRef(onSearchStatusChangeRef, onSearchStatusChange);
  useUpdateSearchEffectCallbackRef(onSearchTargetHandledRef, onSearchTargetHandled);

  useEffect(() => {
    const query = normalizeQuery(searchQuery);
    const container = scrollContainerRef.current;
    if (!query || !container || !totalPages) {
      onSearchDebugChangeRef.current({ pages: [] });
      onSearchHighlightsChangeRef.current([]);
      resetSearchCursorState({ cursorRef, lastHandledTargetIdRef, lastRequestIdRef, lastQueryRef, query });
      onSearchStatusChangeRef.current({ current: 0, hasQuery: query.length > 0, total: 0 });
      return;
    }
    runPdfSearchCycle({
      container,
      cursorRef,
      lastHandledTargetIdRef,
      lastQueryRef,
      lastRequestIdRef,
      onSearchDebugChange: onSearchDebugChangeRef.current,
      onSearchHighlightsChange: onSearchHighlightsChangeRef.current,
      onSearchRequestHandled: onSearchRequestHandledRef.current,
      onSearchStatusChange: onSearchStatusChangeRef.current,
      onSearchTargetHandled: onSearchTargetHandledRef.current,
      pageElementsRef,
      pageTextByNumberRef,
      query,
      searchRequest,
      searchTarget,
      totalPages
    });
  }, [pageElementsRef, pageTextByNumberRef, searchQuery, searchRequest, searchRevision, searchTarget, scrollContainerRef, totalPages]);
}

function useUpdateSearchEffectCallbackRef<T>(ref: { current: T }, value: T) {
  useEffect(() => {
    ref.current = value;
  }, [value]);
}
