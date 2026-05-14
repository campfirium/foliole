import { useEffect, useRef, type MutableRefObject } from 'react';

import { definedProps } from '../../shared/lib/definedProps';

import type {
  PdfSearchArgs,
  PdfSearchDebugInfo,
  PdfSearchRequest,
  PdfSearchStatus,
  PdfSearchTarget,
  PdfSearchVisualHighlight
} from './PdfDocumentSearch';
import type { PdfPageTextEntry } from './pdfPageText';
import {
  canScrollToMatch,
  resetSearchCursorState,
  resolveCursorByRequest,
  scrollToMatch,
  toSearchHighlights
} from './pdfSearchEffectRuntime';
import { collectMatches, getLastPdfSearchDebug } from './pdfSearchMatchCollection';

interface PdfSearchStateRefs {
  cursorRef: MutableRefObject<number>;
  lastHandledTargetIdRef: MutableRefObject<number | null>;
  lastQueryRef: MutableRefObject<string>;
  lastRequestIdRef: MutableRefObject<number | null>;
}

interface PdfSearchCallbackRefs {
  onSearchDebugChangeRef: MutableRefObject<PdfSearchArgs['onSearchDebugChange']>;
  onSearchHighlightsChangeRef: MutableRefObject<PdfSearchArgs['onSearchHighlightsChange']>;
  onSearchRequestHandledRef: MutableRefObject<PdfSearchArgs['onSearchRequestHandled']>;
  onSearchStatusChangeRef: MutableRefObject<PdfSearchArgs['onSearchStatusChange']>;
  onSearchTargetHandledRef: MutableRefObject<PdfSearchArgs['onSearchTargetHandled']>;
}

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

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

export function usePdfSearchCycleEffect(args: PdfSearchArgs) {
  const stateRefs = usePdfSearchStateRefs();
  const callbackRefs = usePdfSearchCallbackRefs(args);
  useRunPdfSearchCycleEffect(args, stateRefs, callbackRefs);
}

function usePdfSearchStateRefs(): PdfSearchStateRefs {
  return {
    cursorRef: useRef(0),
    lastHandledTargetIdRef: useRef<number | null>(null),
    lastQueryRef: useRef(''),
    lastRequestIdRef: useRef<number | null>(null)
  };
}

function usePdfSearchCallbackRefs(args: PdfSearchArgs): PdfSearchCallbackRefs {
  const refs = {
    onSearchDebugChangeRef: useRef(args.onSearchDebugChange),
    onSearchHighlightsChangeRef: useRef(args.onSearchHighlightsChange),
    onSearchRequestHandledRef: useRef(args.onSearchRequestHandled),
    onSearchStatusChangeRef: useRef(args.onSearchStatusChange),
    onSearchTargetHandledRef: useRef(args.onSearchTargetHandled)
  };
  useUpdateSearchEffectCallbackRef(refs.onSearchDebugChangeRef, args.onSearchDebugChange);
  useUpdateSearchEffectCallbackRef(refs.onSearchHighlightsChangeRef, args.onSearchHighlightsChange);
  useUpdateSearchEffectCallbackRef(refs.onSearchRequestHandledRef, args.onSearchRequestHandled);
  useUpdateSearchEffectCallbackRef(refs.onSearchStatusChangeRef, args.onSearchStatusChange);
  useUpdateSearchEffectCallbackRef(refs.onSearchTargetHandledRef, args.onSearchTargetHandled);
  return refs;
}

function useRunPdfSearchCycleEffect(args: PdfSearchArgs, stateRefs: PdfSearchStateRefs, callbackRefs: PdfSearchCallbackRefs) {
  useEffect(() => {
    const query = normalizeQuery(args.searchQuery);
    const container = args.scrollContainerRef.current;
    if (!query || !container || !args.totalPages) {
      resetInactivePdfSearch(query, stateRefs, callbackRefs);
      return;
    }
    runActivePdfSearchCycle(query, container, args, stateRefs, callbackRefs);
  }, [
    args.pageElementsRef,
    args.pageTextByNumberRef,
    args.scrollContainerRef,
    args.searchQuery,
    args.searchRequest,
    args.searchRevision,
    args.searchTarget,
    args.totalPages,
    callbackRefs.onSearchDebugChangeRef,
    callbackRefs.onSearchHighlightsChangeRef,
    callbackRefs.onSearchRequestHandledRef,
    callbackRefs.onSearchStatusChangeRef,
    callbackRefs.onSearchTargetHandledRef,
    stateRefs.cursorRef,
    stateRefs.lastHandledTargetIdRef,
    stateRefs.lastQueryRef,
    stateRefs.lastRequestIdRef
  ]);
}

function runActivePdfSearchCycle(
  query: string,
  container: HTMLDivElement,
  args: PdfSearchArgs,
  stateRefs: PdfSearchStateRefs,
  callbackRefs: PdfSearchCallbackRefs
) {
  if (!args.totalPages) {
    return;
  }
  runPdfSearchCycle({
    container,
    pageElementsRef: args.pageElementsRef,
    pageTextByNumberRef: args.pageTextByNumberRef,
    query,
    searchRequest: args.searchRequest,
    searchTarget: args.searchTarget,
    totalPages: args.totalPages,
    ...stateRefs,
    onSearchDebugChange: callbackRefs.onSearchDebugChangeRef.current,
    onSearchHighlightsChange: callbackRefs.onSearchHighlightsChangeRef.current,
    onSearchStatusChange: callbackRefs.onSearchStatusChangeRef.current,
    ...definedProps({
      onSearchRequestHandled: callbackRefs.onSearchRequestHandledRef.current,
      onSearchTargetHandled: callbackRefs.onSearchTargetHandledRef.current
    })
  });
}

function resetInactivePdfSearch(query: string, stateRefs: PdfSearchStateRefs, callbackRefs: PdfSearchCallbackRefs) {
  callbackRefs.onSearchDebugChangeRef.current({ pages: [] });
  callbackRefs.onSearchHighlightsChangeRef.current([]);
  resetSearchCursorState({ ...stateRefs, query });
  callbackRefs.onSearchStatusChangeRef.current({ current: 0, hasQuery: query.length > 0, total: 0 });
}

function useUpdateSearchEffectCallbackRef<T>(ref: { current: T }, value: T) {
  useEffect(() => {
    ref.current = value;
  }, [value]);
}
