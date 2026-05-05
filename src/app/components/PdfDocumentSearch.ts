import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

import { collectMatches, type PdfSearchMatch } from './pdfSearchMatchCollection';

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
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  pageTextByNumberRef: MutableRefObject<Record<number, string>>;
  searchRevision: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
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

const SEARCH_HIT_ATTR = 'data-pdf-search-hit';
const SEARCH_HIT_MATCH = 'match';
const SEARCH_HIT_ACTIVE = 'active';

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

export { collectMatches } from './pdfSearchMatchCollection';

function scrollToMatch(container: HTMLDivElement, match: PdfSearchMatch) {
  const shell = container.querySelector<HTMLElement>(`[data-pdf-page-number="${match.page}"]`);
  if (!shell) {
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const targetRect = match.element.getBoundingClientRect();
  const rawTop = container.scrollTop + (targetRect.top - containerRect.top) - container.clientHeight * 0.36;
  const top = Math.max(0, rawTop);
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ behavior: 'smooth', top });
  } else {
    container.scrollTop = top;
  }
}

function clearSearchHitMarker(container: HTMLDivElement) {
  const markedHits = container.querySelectorAll<HTMLElement>(`[${SEARCH_HIT_ATTR}]`);
  for (const hit of markedHits) {
    hit.removeAttribute(SEARCH_HIT_ATTR);
  }
}

function markSearchHits(matches: PdfSearchMatch[]) {
  const seen = new Set<HTMLElement>();
  for (const match of matches) {
    if (seen.has(match.element)) {
      continue;
    }
    seen.add(match.element);
    match.element.setAttribute(SEARCH_HIT_ATTR, SEARCH_HIT_MATCH);
  }
}

function markActiveSearchHit(match: PdfSearchMatch) {
  match.element.setAttribute(SEARCH_HIT_ATTR, SEARCH_HIT_ACTIVE);
}

function resolveNextCursor(request: PdfSearchRequest | null, current: number, total: number) {
  if (!request) {
    return current;
  }
  if (request.direction === 'previous') {
    return (current - 1 + total) % total;
  }
  return (current + 1) % total;
}

function resolveTargetCursor(matches: PdfSearchMatch[], target: PdfSearchTarget) {
  const exactIndex = matches.findIndex((match) => match.page === target.page && match.matchStart === target.matchStart);
  if (exactIndex >= 0) {
    return exactIndex;
  }
  const samePage = matches
    .map((match, index) => ({ index, match }))
    .filter((entry) => entry.match.page === target.page);
  if (samePage.length === 0) {
    return 0;
  }
  samePage.sort(
    (left, right) => Math.abs(left.match.matchStart - target.matchStart) - Math.abs(right.match.matchStart - target.matchStart)
  );
  return samePage[0]?.index ?? 0;
}

function resetSearchCursorState(args: {
  cursorRef: { current: number };
  lastHandledTargetIdRef: { current: number | null };
  lastRequestIdRef: { current: number | null };
  lastQueryRef: { current: string };
  query: string;
}) {
  args.cursorRef.current = 0;
  args.lastHandledTargetIdRef.current = null;
  args.lastRequestIdRef.current = null;
  args.lastQueryRef.current = args.query;
}

function resolveCursorByRequest(args: {
  cursorRef: { current: number };
  lastHandledTargetIdRef: { current: number | null };
  lastQueryRef: { current: string };
  lastRequestIdRef: { current: number | null };
  matches: PdfSearchMatch[];
  query: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
}) {
  const queryChanged = args.lastQueryRef.current !== args.query;

  if (queryChanged) {
    args.cursorRef.current = 0;
    args.lastHandledTargetIdRef.current = null;
    args.lastRequestIdRef.current = null;
  }

  if (args.searchTarget && (queryChanged || args.searchTarget.id !== args.lastHandledTargetIdRef.current)) {
    args.cursorRef.current = resolveTargetCursor(args.matches, args.searchTarget);
    args.lastHandledTargetIdRef.current = args.searchTarget.id;
    args.lastRequestIdRef.current = null;
  } else if (args.searchRequest && args.searchRequest.id !== args.lastRequestIdRef.current) {
    args.cursorRef.current = resolveNextCursor(args.searchRequest, args.cursorRef.current, args.matches.length);
    args.lastRequestIdRef.current = args.searchRequest.id;
  }
  args.lastQueryRef.current = args.query;
}

export function usePdfSearchEffect({
  onSearchStatusChange,
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

  useEffect(() => {
    const query = normalizeQuery(searchQuery);
    const container = scrollContainerRef.current;
    if (!query || !container || !totalPages) {
      if (container) {
        clearSearchHitMarker(container);
      }
      resetSearchCursorState({ cursorRef, lastHandledTargetIdRef, lastRequestIdRef, lastQueryRef, query });
      onSearchStatusChange({ current: 0, hasQuery: query.length > 0, total: 0 });
      return;
    }

    const matches = collectMatches(pageElementsRef, totalPages, query, pageTextByNumberRef);
    if (matches.length === 0) {
      clearSearchHitMarker(container);
      resetSearchCursorState({ cursorRef, lastHandledTargetIdRef, lastRequestIdRef, lastQueryRef, query });
      onSearchStatusChange({ current: 0, hasQuery: true, total: 0 });
      return;
    }

    resolveCursorByRequest({
      cursorRef,
      lastHandledTargetIdRef,
      lastQueryRef,
      lastRequestIdRef,
      matches,
      query,
      searchRequest,
      searchTarget
    });

    const match = matches[cursorRef.current];
    if (!match) {
      clearSearchHitMarker(container);
      onSearchStatusChange({ current: 0, hasQuery: true, total: matches.length });
      return;
    }

    clearSearchHitMarker(container);
    markSearchHits(matches);
    markActiveSearchHit(match);
    scrollToMatch(container, match);
    onSearchStatusChange({ current: cursorRef.current + 1, hasQuery: true, total: matches.length });
  }, [onSearchStatusChange, pageElementsRef, pageTextByNumberRef, searchQuery, searchRequest, searchRevision, searchTarget, scrollContainerRef, totalPages]);
}
