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

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

function collectMatches(pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>, totalPages: number, query: string): PdfSearchMatch[] {
  const matches: PdfSearchMatch[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const shell = pageElementsRef.current[page];
    if (!shell) {
      continue;
    }
    const textSpans = shell.querySelectorAll<HTMLElement>('.textLayer span');
    for (const span of textSpans) {
      const text = span.textContent?.toLocaleLowerCase() ?? '';
      if (text.includes(query)) {
        matches.push({ element: span, page });
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
  const top = Math.max(0, container.scrollTop + (targetRect.top - containerRect.top) - container.clientHeight * 0.35);
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ behavior: 'smooth', top });
  } else {
    container.scrollTop = top;
  }
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
  scrollContainerRef,
  searchQuery,
  searchRequest,
  totalPages
}: PdfSearchArgs) {
  const cursorRef = useRef(0);
  const lastQueryRef = useRef('');

  useEffect(() => {
    const query = normalizeQuery(searchQuery);
    const container = scrollContainerRef.current;
    if (!query || !container || !totalPages) {
      cursorRef.current = 0;
      lastQueryRef.current = query;
      onSearchStatusChange({ current: 0, hasQuery: query.length > 0, total: 0 });
      return;
    }

    const matches = collectMatches(pageElementsRef, totalPages, query);
    if (matches.length === 0) {
      cursorRef.current = 0;
      lastQueryRef.current = query;
      onSearchStatusChange({ current: 0, hasQuery: true, total: 0 });
      return;
    }

    if (lastQueryRef.current !== query) {
      cursorRef.current = 0;
    } else {
      cursorRef.current = resolveNextCursor(searchRequest, cursorRef.current, matches.length);
    }
    lastQueryRef.current = query;

    const match = matches[cursorRef.current];
    if (!match) {
      onSearchStatusChange({ current: 0, hasQuery: true, total: matches.length });
      return;
    }

    scrollToMatch(container, match);
    onSearchStatusChange({ current: cursorRef.current + 1, hasQuery: true, total: matches.length });
  }, [onSearchStatusChange, pageElementsRef, scrollContainerRef, searchQuery, searchRequest, totalPages]);
}
