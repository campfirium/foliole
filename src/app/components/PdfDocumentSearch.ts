import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

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
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  totalPages: number | null;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
}

interface PdfSearchMatch {
  element: HTMLElement;
  page: number;
}

const SEARCH_HIT_ATTR = 'data-pdf-search-hit';
const SEARCH_HIT_MATCH = 'match';
const SEARCH_HIT_ACTIVE = 'active';

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

interface TextSpanSegment {
  element: HTMLElement;
  end: number;
  start: number;
}

function collectTextSegments(shell: HTMLDivElement): TextSpanSegment[] {
  const textLayer = shell.querySelector<HTMLElement>('.textLayer');
  if (!textLayer || typeof document.createTreeWalker !== 'function') {
    return [];
  }
  const segments: TextSpanSegment[] = [];
  const textBySpan = new Map<HTMLElement, string>();
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textValue = node.textContent ?? '';
    if (textValue.length > 0) {
      const container = node.parentElement?.closest<HTMLElement>('span');
      if (container) {
        textBySpan.set(container, `${textBySpan.get(container) ?? ''}${textValue}`);
      }
    }
    node = walker.nextNode();
  }
  let cursor = 0;
  for (const [span, text] of textBySpan) {
    if (!text) {
      continue;
    }
    const start = cursor;
    const end = start + text.length;
    segments.push({ element: span, end, start });
    cursor = end;
  }
  return segments;
}

function resolveSegmentAtPosition(segments: TextSpanSegment[], position: number) {
  for (const segment of segments) {
    if (position >= segment.start && position < segment.end) {
      return segment;
    }
  }
  return segments[segments.length - 1] ?? null;
}

function collectQueryPositions(text: string, query: string) {
  if (!text || !query) {
    return [];
  }
  const positions: number[] = [];
  let index = 0;
  while (index < text.length) {
    const next = text.indexOf(query, index);
    if (next < 0) {
      break;
    }
    positions.push(next);
    index = next + 1;
  }
  return positions;
}

export function collectMatches(
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>,
  totalPages: number,
  query: string,
  pageTextByNumberRef?: MutableRefObject<Record<number, string>>
): PdfSearchMatch[] {
  const matches: PdfSearchMatch[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const shell = pageElementsRef.current[page];
    if (!shell) {
      continue;
    }
    const segments = collectTextSegments(shell);
    const renderedPageText = segments.map((segment) => segment.element.textContent ?? '').join('').toLocaleLowerCase();
    const indexedPageText = (pageTextByNumberRef?.current[page] ?? '').toLocaleLowerCase();
    const pageText = renderedPageText.length > 0 ? renderedPageText : indexedPageText;
    if (!pageText) {
      continue;
    }
    const positions = collectQueryPositions(pageText, query);
    for (const position of positions) {
      if (segments.length === 0) {
        matches.push({ element: shell, page });
        continue;
      }
      const segment = resolveSegmentAtPosition(segments, position);
      if (segment) {
        matches.push({ element: segment.element, page });
      }
    }
  }
  return matches;
}

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

export function usePdfSearchEffect({
  onSearchStatusChange,
  pageElementsRef,
  pageTextByNumberRef,
  searchRevision,
  scrollContainerRef,
  searchQuery,
  searchRequest,
  totalPages
}: PdfSearchArgs) {
  const cursorRef = useRef(0);
  const lastRequestIdRef = useRef<number | null>(null);
  const lastQueryRef = useRef('');

  useEffect(() => {
    const query = normalizeQuery(searchQuery);
    const container = scrollContainerRef.current;
    if (!query || !container || !totalPages) {
      if (container) {
        clearSearchHitMarker(container);
      }
      cursorRef.current = 0;
      lastRequestIdRef.current = null;
      lastQueryRef.current = query;
      onSearchStatusChange({ current: 0, hasQuery: query.length > 0, total: 0 });
      return;
    }

    const matches = collectMatches(pageElementsRef, totalPages, query, pageTextByNumberRef);
    if (matches.length === 0) {
      clearSearchHitMarker(container);
      cursorRef.current = 0;
      lastRequestIdRef.current = null;
      lastQueryRef.current = query;
      onSearchStatusChange({ current: 0, hasQuery: true, total: 0 });
      return;
    }

    if (lastQueryRef.current !== query) {
      cursorRef.current = 0;
      lastRequestIdRef.current = null;
    } else if (searchRequest && searchRequest.id !== lastRequestIdRef.current) {
      cursorRef.current = resolveNextCursor(searchRequest, cursorRef.current, matches.length);
      lastRequestIdRef.current = searchRequest.id;
    }
    lastQueryRef.current = query;

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
  }, [onSearchStatusChange, pageElementsRef, pageTextByNumberRef, scrollContainerRef, searchQuery, searchRequest, searchRevision, totalPages]);
}
