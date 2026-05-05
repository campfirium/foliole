import type { MutableRefObject } from 'react';

import type { PdfPageTextEntry } from './pdfPageText';
import { collectMappedQueryRanges, resolveIndexedEntry, resolvePageBounds } from './pdfSearchMatchCollectionUtils';
import { resolveGeometryFromRenderedSegments } from './pdfSearchMatchGeometry';
import { collectTextSegments } from './pdfSearchTextSegments';

export interface PdfSearchMatch {
  element: HTMLElement;
  id: string;
  matchStart: number;
  page: number;
  rects: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

interface PdfSearchPageDebug {
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
}

let lastPdfSearchDebug: PdfSearchPageDebug[] = [];

export function getLastPdfSearchDebug() {
  return lastPdfSearchDebug;
}

function buildFallbackMatch(page: number, shell: HTMLDivElement, position: number, index: number): PdfSearchMatch {
  return {
    element: shell,
    id: `${page}:${position}:${index}`,
    matchStart: position,
    page,
    rects: [],
    x: null,
    y: null
  };
}

function buildMatch(
  page: number,
  shell: HTMLDivElement,
  position: number,
  index: number,
  geometry: { element: HTMLElement; rects: Array<{ height: number; width: number; x: number; y: number }>; x: number | null; y: number | null } | null
): PdfSearchMatch {
  if (!geometry) {
    return buildFallbackMatch(page, shell, position, index);
  }
  return {
    element: geometry.element,
    id: `${page}:${position}:${index}`,
    matchStart: position,
    page,
    rects: geometry.rects,
    x: geometry.x,
    y: geometry.y
  };
}

function collectIndexedPendingMatches(args: {
  diagnostics: Omit<PdfSearchPageDebug, 'indexedRangeCount' | 'indexedTextLength' | 'matchCount' | 'route'>;
  indexedEntry: PdfPageTextEntry;
  page: number;
  query: string;
  shell: HTMLDivElement;
}) {
  const indexedRanges = collectMappedQueryRanges(args.indexedEntry.text.toLocaleLowerCase(), args.query);
  const matches = indexedRanges.map((range, index) => buildFallbackMatch(args.page, args.shell, range.start, index));
  return {
    debug: {
      ...args.diagnostics,
      indexedRangeCount: indexedRanges.length,
      indexedTextLength: args.indexedEntry.text.length,
      matchCount: indexedRanges.length,
      route: indexedRanges.length > 0 ? ('indexed-pending' as const) : ('none' as const)
    },
    matches
  };
}

function collectRenderedMatches(args: {
  diagnostics: Omit<PdfSearchPageDebug, 'indexedRangeCount' | 'indexedTextLength' | 'matchCount' | 'renderedRangeCount' | 'renderedTextLength' | 'route'>;
  page: number;
  pageBounds: HTMLElement;
  query: string;
  shell: HTMLDivElement;
}) {
  const segments = collectTextSegments(args.shell);
  const renderedPageText = segments.map((segment) => segment.text).join('').toLocaleLowerCase();
  const renderedRanges = collectMappedQueryRanges(renderedPageText, args.query);
  const matches = renderedRanges.map((range, index) =>
    buildMatch(
      args.page,
      args.shell,
      range.start,
      index,
      resolveGeometryFromRenderedSegments({
        matchStart: range.start,
        pageBounds: args.pageBounds,
        queryLength: range.end - range.start,
        segments
      })
    )
  );
  return {
    debug: {
      ...args.diagnostics,
      indexedRangeCount: 0,
      indexedTextLength: 0,
      matchCount: renderedRanges.length,
      renderedRangeCount: renderedRanges.length,
      renderedTextLength: renderedPageText.length,
      route: renderedRanges.length > 0 ? ('rendered' as const) : ('none' as const)
    },
    matches
  };
}

export function collectMatches(
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>,
  totalPages: number,
  query: string,
  pageTextByNumberRef?: MutableRefObject<Record<number, PdfPageTextEntry | string>>
): PdfSearchMatch[] {
  const matches: PdfSearchMatch[] = [];
  const debugPages: PdfSearchPageDebug[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const shell = pageElementsRef.current[page];
    if (!shell) continue;

    const pageBounds = resolvePageBounds(shell);
    const textLayer = pageBounds.querySelector<HTMLElement>('.textLayer');
    const itemNodeCount = textLayer
      ? textLayer.querySelectorAll('span[role="presentation"], div[role="presentation"], span, div').length
      : 0;
    const diagnostics = {
      hasTextLayer: !!textLayer,
      itemNodeCount,
      page,
      pageTextLength: (pageBounds.textContent ?? '').trim().length,
      renderedRangeCount: 0,
      renderedTextLength: 0,
      textLayerChildCount: textLayer?.childElementCount ?? 0,
      textLayerTextLength: (textLayer?.textContent ?? '').trim().length
    };
    const segments = collectTextSegments(shell);
    if (segments.length > 0) {
      const renderedResult = collectRenderedMatches({ diagnostics, page, pageBounds, query, shell });
      debugPages.push(renderedResult.debug);
      matches.push(...renderedResult.matches);
      continue;
    }

    const indexedEntry = resolveIndexedEntry(pageTextByNumberRef?.current[page]);
    const indexedPageText = indexedEntry.text.toLocaleLowerCase();
    if (indexedPageText.length > 0) {
      const indexedResult = collectIndexedPendingMatches({ diagnostics, indexedEntry, page, query, shell });
      debugPages.push(indexedResult.debug);
      matches.push(...indexedResult.matches);
      continue;
    }
    debugPages.push({
      ...diagnostics,
      indexedRangeCount: 0,
      indexedTextLength: 0,
      matchCount: 0,
      route: 'none'
    });
  }
  lastPdfSearchDebug = debugPages;
  return matches;
}
