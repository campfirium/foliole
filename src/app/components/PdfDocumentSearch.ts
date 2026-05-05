import { useEffect, useRef, useState } from 'react';
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

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

interface TextSpanSegment {
  element: HTMLElement;
  end: number;
  start: number;
}

function collectTextSegments(shell: HTMLDivElement): TextSpanSegment[] {
  const segments: TextSpanSegment[] = [];
  const textSpans = resolveSearchTextSpans(shell);
  let cursor = 0;
  for (const span of textSpans) {
    const text = span.textContent ?? '';
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

function resolveSearchTextSpans(shell: HTMLDivElement) {
  const presentationSpans = shell.querySelectorAll<HTMLElement>('.textLayer span[role="presentation"]');
  if (presentationSpans.length > 0) {
    return presentationSpans;
  }
  return Array.from(shell.querySelectorAll<HTMLElement>('.textLayer span')).filter(
    (span) => !span.classList.contains('markedContent') && !span.querySelector('span')
  );
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
    const indexedPageText = pageTextByNumberRef?.current[page];
    const pageText =
      (indexedPageText && indexedPageText.length > 0 ? indexedPageText : segments.map((segment) => segment.element.textContent ?? '').join('')).toLocaleLowerCase();
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
      if (!segment) {
        matches.push({ element: shell, page });
        continue;
      }
      matches.push({ element: segment.element, page });
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

function hasTextLayerInNodeList(nodes: NodeList) {
  for (const node of nodes) {
    if (!(node instanceof Element)) {
      continue;
    }
    if (node.classList.contains('textLayer')) {
      return true;
    }
    if (node.closest('.textLayer')) {
      return true;
    }
    if (node.querySelector('.textLayer')) {
      return true;
    }
  }
  return false;
}

function isTextLayerMutation(record: MutationRecord) {
  if (record.type === 'characterData') {
    return !!record.target.parentElement?.closest('.textLayer');
  }
  if (record.target instanceof Element && record.target.closest('.textLayer')) {
    return true;
  }
  return hasTextLayerInNodeList(record.addedNodes) || hasTextLayerInNodeList(record.removedNodes);
}

function useTextLayerMutationRevision(
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  searchQuery: string,
  totalPages: number | null
) {
  const [mutationRevision, setMutationRevision] = useState(0);

  useEffect(() => {
    const query = normalizeQuery(searchQuery);
    const container = scrollContainerRef.current;
    if (!query || !container || !totalPages || typeof MutationObserver === 'undefined') {
      return;
    }

    let frameId: number | null = null;
    let timeoutId: number | null = null;
    const observer = new MutationObserver((records) => {
      if (!records.some(isTextLayerMutation)) {
        return;
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      frameId = window.requestAnimationFrame(() => {
        timeoutId = window.setTimeout(() => {
          setMutationRevision((current) => current + 1);
        }, 0);
      });
    });

    observer.observe(container, {
      characterData: true,
      childList: true,
      subtree: true
    });

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [scrollContainerRef, searchQuery, totalPages]);

  return mutationRevision;
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
  const lastQueryRef = useRef('');
  const textLayerMutationRevision = useTextLayerMutationRevision(scrollContainerRef, searchQuery, totalPages);

  useEffect(() => {
    const query = normalizeQuery(searchQuery);
    const container = scrollContainerRef.current;
    if (!query || !container || !totalPages) {
      cursorRef.current = 0;
      lastQueryRef.current = query;
      onSearchStatusChange({ current: 0, hasQuery: query.length > 0, total: 0 });
      return;
    }

    const matches = collectMatches(pageElementsRef, totalPages, query, pageTextByNumberRef);
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
  }, [onSearchStatusChange, pageElementsRef, pageTextByNumberRef, scrollContainerRef, searchQuery, searchRequest, searchRevision, textLayerMutationRevision, totalPages]);
}
