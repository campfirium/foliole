import type { MutableRefObject } from 'react';

export interface PdfSearchMatch {
  element: HTMLElement;
  id: string;
  matchStart: number;
  page: number;
  rects: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

interface TextSpanSegment {
  element: HTMLElement;
  end: number;
  node: Text;
  start: number;
}

function collectTextSegments(shell: HTMLDivElement): TextSpanSegment[] {
  const textLayer = shell.querySelector<HTMLElement>('.textLayer');
  if (!textLayer || typeof document.createTreeWalker !== 'function') {
    return [];
  }
  const segments: TextSpanSegment[] = [];
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let node = walker.nextNode();
  while (node) {
    if (!(node instanceof Text)) {
      node = walker.nextNode();
      continue;
    }
    const textValue = node.textContent ?? '';
    if (textValue.length > 0) {
      const container = node.parentElement?.closest<HTMLElement>('span');
      if (container) {
        const start = cursor;
        const end = start + textValue.length;
        segments.push({ element: container, end, node, start });
        cursor = end;
      }
    }
    node = walker.nextNode();
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

function resolvePageBounds(shell: HTMLDivElement) {
  return shell.querySelector<HTMLElement>('.react-pdf__Page') ?? shell;
}

function normalizeRect(
  rect: DOMRect,
  pageRect: DOMRect
): { height: number; width: number; x: number; y: number } | null {
  if (pageRect.width <= 0 || pageRect.height <= 0 || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const x = (rect.left - pageRect.left) / pageRect.width;
  const y = (rect.top - pageRect.top) / pageRect.height;
  const width = rect.width / pageRect.width;
  const height = rect.height / pageRect.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return {
    height: Math.max(0, Math.min(1, height)),
    width: Math.max(0, Math.min(1, width)),
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y))
  };
}

function collectRangeRects(range: Range, pageBounds: HTMLElement) {
  const pageRect = pageBounds.getBoundingClientRect();
  const rectSource = typeof range.getClientRects === 'function' ? range.getClientRects() : [];
  const normalizedRects = Array.from(rectSource)
    .map((rect) => normalizeRect(rect, pageRect))
    .filter((rect): rect is { height: number; width: number; x: number; y: number } => !!rect);
  if (normalizedRects.length > 0) {
    return normalizedRects;
  }
  if (typeof range.getBoundingClientRect !== 'function') {
    return [];
  }
  const fallback = normalizeRect(range.getBoundingClientRect(), pageRect);
  return fallback ? [fallback] : [];
}

function resolveMatchGeometry(
  pageBounds: HTMLElement,
  segments: TextSpanSegment[],
  matchStart: number,
  queryLength: number
): {
  element: HTMLElement;
  rects: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
} | null {
  if (segments.length === 0 || queryLength <= 0) {
    return null;
  }
  const startSegment = resolveSegmentAtPosition(segments, matchStart);
  const endSegment = resolveSegmentAtPosition(segments, matchStart + queryLength - 1);
  if (!startSegment || !endSegment) {
    return null;
  }
  const startOffset = Math.max(0, Math.min(startSegment.node.length, matchStart - startSegment.start));
  const endOffset = Math.max(startOffset, Math.min(endSegment.node.length, matchStart + queryLength - endSegment.start));
  const range = document.createRange();
  range.setStart(startSegment.node, startOffset);
  range.setEnd(endSegment.node, endOffset);
  const rects = collectRangeRects(range, pageBounds);
  const firstRect = rects[0] ?? null;
  return {
    element: startSegment.element,
    rects,
    x: firstRect ? firstRect.x + firstRect.width / 2 : null,
    y: firstRect ? firstRect.y + firstRect.height / 2 : null
  };
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
    const pageBounds = resolvePageBounds(shell);
    const segments = collectTextSegments(shell);
    const renderedPageText = segments.map((segment) => segment.node.textContent ?? '').join('').toLocaleLowerCase();
    const indexedPageText = (pageTextByNumberRef?.current[page] ?? '').toLocaleLowerCase();
    const pageText = renderedPageText.length > 0 ? renderedPageText : indexedPageText;
    if (!pageText) {
      continue;
    }
    const positions = collectQueryPositions(pageText, query);
    positions.forEach((position, index) => {
      const geometry = resolveMatchGeometry(pageBounds, segments, position, query.length);
      if (!geometry) {
        matches.push({
          element: shell,
          id: `${page}:${position}:${index}`,
          matchStart: position,
          page,
          rects: [],
          x: null,
          y: null
        });
        return;
      }
      matches.push({
        element: geometry.element,
        id: `${page}:${position}:${index}`,
        matchStart: position,
        page,
        rects: geometry.rects,
        x: geometry.x,
        y: geometry.y
      });
    });
  }
  return matches;
}
