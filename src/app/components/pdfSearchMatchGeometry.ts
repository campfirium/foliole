import type { TextSpanSegment } from './pdfSearchTextSegments';

export interface PdfMatchGeometry {
  element: HTMLElement;
  rects: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

type NormalizedRect = { height: number; width: number; x: number; y: number };

function normalizeRect(rect: DOMRect, pageRect: DOMRect): { height: number; width: number; x: number; y: number } | null {
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

function dedupeNormalizedRects(rects: NormalizedRect[]) {
  const seen = new Set<string>();
  return rects.filter((rect) => {
    const key = `${Math.round(rect.x * 10000)}:${Math.round(rect.y * 10000)}:${Math.round(rect.width * 10000)}:${Math.round(rect.height * 10000)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveTextNode(element: HTMLElement) {
  const firstChild = element.firstChild;
  if (firstChild instanceof Text) {
    return firstChild;
  }
  return element.childNodes[0] instanceof Text ? element.childNodes[0] : null;
}

function resolveRangeRects(range: Range, pageRect: DOMRect) {
  if (typeof range.getClientRects !== 'function') {
    return [] as NormalizedRect[];
  }
  const rects = Array.from(range.getClientRects())
    .map((rect) => normalizeRect(new DOMRect(rect.left, rect.top, rect.width, rect.height), pageRect))
    .filter((rect): rect is NormalizedRect => !!rect);
  return dedupeNormalizedRects(rects);
}

function resolveRangeRectForNode(node: Text, startOffset: number, endOffset: number, pageRect: DOMRect, fallbackElement: HTMLElement) {
  if (typeof document.createRange !== 'function') {
    return [] as NormalizedRect[];
  }
  const range = document.createRange();
  range.setStart(node, startOffset);
  range.setEnd(node, endOffset);
  const rects = resolveRangeRects(range, pageRect);
  if (rects.length > 0) {
    return rects;
  }
  if (typeof range.getBoundingClientRect !== 'function') {
    const fallbackElementRect = normalizeRect(fallbackElement.getBoundingClientRect(), pageRect);
    return fallbackElementRect ? [fallbackElementRect] : [];
  }
  const fallbackRect = normalizeRect(range.getBoundingClientRect(), pageRect);
  if (fallbackRect) {
    return [fallbackRect];
  }
  const fallbackElementRect = normalizeRect(fallbackElement.getBoundingClientRect(), pageRect);
  return fallbackElementRect ? [fallbackElementRect] : [];
}

function collectOverlappedItemIndexes(indexedItemRanges: Array<{ end: number; start: number }>, matchStart: number, matchEnd: number) {
  return indexedItemRanges
    .map((range, index) => ({ index, range }))
    .filter((entry) => entry.range.start < matchEnd && entry.range.end > matchStart)
    .map((entry) => entry.index);
}

function collectItemRangeRects(
  indexedItemRanges: Array<{ end: number; start: number }>,
  itemNodes: HTMLElement[],
  matchStart: number,
  matchEnd: number,
  pageRect: DOMRect
) {
  const rects: NormalizedRect[] = [];
  const overlappedIndexes = collectOverlappedItemIndexes(indexedItemRanges, matchStart, matchEnd);
  for (const index of overlappedIndexes) {
    const itemNode = itemNodes[index] ?? null;
    const itemRange = indexedItemRanges[index] ?? null;
    if (!itemNode || !itemRange) {
      continue;
    }
    const textNode = resolveTextNode(itemNode);
    if (!textNode) {
      const fallbackRect = normalizeRect(itemNode.getBoundingClientRect(), pageRect);
      if (fallbackRect) {
        rects.push(fallbackRect);
      }
      continue;
    }
    const startOffset = Math.max(0, matchStart - itemRange.start);
    const endOffset = Math.min(textNode.length, matchEnd - itemRange.start);
    if (endOffset <= startOffset) {
      continue;
    }
    rects.push(...resolveRangeRectForNode(textNode, startOffset, endOffset, pageRect, itemNode));
  }
  return dedupeNormalizedRects(rects);
}

function collectSegmentRangeRects(matchedSegments: TextSpanSegment[], matchStart: number, matchEnd: number, pageRect: DOMRect) {
  const rects: NormalizedRect[] = [];
  for (const segment of matchedSegments) {
    const startOffset = Math.max(0, matchStart - segment.start);
    const endOffset = Math.min(segment.node.length, matchEnd - segment.start);
    if (endOffset <= startOffset) {
      continue;
    }
    rects.push(...resolveRangeRectForNode(segment.node, startOffset, endOffset, pageRect, segment.element));
  }
  return dedupeNormalizedRects(rects);
}

function appendRangeFallbackRect(
  rects: NormalizedRect[],
  matchedSegments: TextSpanSegment[],
  matchStart: number,
  matchEnd: number,
  pageRect: DOMRect
) {
  if (rects.length > 0) return;
  const startSegment = matchedSegments[0] ?? null;
  if (!startSegment || typeof document.createRange !== 'function') return;
  const startOffset = Math.max(0, Math.min(startSegment.node.length, matchStart - startSegment.start));
  const endOffset = Math.max(startOffset + 1, Math.min(startSegment.node.length, matchEnd - startSegment.start));
  const range = document.createRange();
  range.setStart(startSegment.node, startOffset);
  range.setEnd(startSegment.node, endOffset);
  if (typeof range.getBoundingClientRect !== 'function') return;
  const fallbackRect = normalizeRect(range.getBoundingClientRect(), pageRect);
  if (fallbackRect) {
    rects.push(fallbackRect);
  }
}

export function resolveGeometryFromIndexedMapping(args: {
  indexedItemRanges: Array<{ end: number; start: number }>;
  itemNodes: HTMLElement[];
  matchStart: number;
  pageBounds: HTMLElement;
  queryLength: number;
}): PdfMatchGeometry | null {
  if (args.queryLength <= 0) return null;
  const matchEnd = args.matchStart + args.queryLength;
  const overlappedItemIndexes = collectOverlappedItemIndexes(args.indexedItemRanges, args.matchStart, matchEnd);
  if (overlappedItemIndexes.length === 0) return null;
  const firstItemElement = args.itemNodes[overlappedItemIndexes[0] ?? -1] ?? args.pageBounds;
  const pageRect = args.pageBounds.getBoundingClientRect();
  const rects = collectItemRangeRects(args.indexedItemRanges, args.itemNodes, args.matchStart, matchEnd, pageRect);
  const firstRect = rects[0] ?? null;
  return {
    element: firstItemElement,
    rects,
    x: firstRect ? firstRect.x + firstRect.width / 2 : null,
    y: firstRect ? firstRect.y + firstRect.height / 2 : null
  };
}

export function resolveGeometryFromRenderedSegments(args: {
  matchStart: number;
  pageBounds: HTMLElement;
  queryLength: number;
  segments: TextSpanSegment[];
}): PdfMatchGeometry | null {
  if (args.segments.length === 0 || args.queryLength <= 0) return null;
  const matchEnd = args.matchStart + args.queryLength;
  const matchedSegments = args.segments.filter((segment) => segment.start < matchEnd && segment.end > args.matchStart);
  if (matchedSegments.length === 0) return null;
  const pageRect = args.pageBounds.getBoundingClientRect();
  const rects = collectSegmentRangeRects(matchedSegments, args.matchStart, matchEnd, pageRect);
  appendRangeFallbackRect(rects, matchedSegments, args.matchStart, matchEnd, pageRect);
  const firstRect = rects[0] ?? null;
  return {
    element: matchedSegments[0]?.element ?? args.pageBounds,
    rects,
    x: firstRect ? firstRect.x + firstRect.width / 2 : null,
    y: firstRect ? firstRect.y + firstRect.height / 2 : null
  };
}
