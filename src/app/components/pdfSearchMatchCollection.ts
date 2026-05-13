import type { MutableRefObject } from 'react';

import { definedProps } from '../../shared/lib/definedProps';

import { collectCrossPageMatches } from './pdfCrossPageMatchCollection';
import type { PdfPageTextEntry } from './pdfPageText';
import { collectMappedQueryRanges, resolveIndexedEntry, resolvePageBounds } from './pdfSearchMatchCollectionUtils';
import { resolveGeometryFromRenderedSegments } from './pdfSearchMatchGeometry';
import { collectTextSegments } from './pdfSearchTextSegments';

export interface PdfSearchMatch {
  fragments?: Array<{
    element: HTMLElement;
    page: number;
    rects: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
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

type BaseSearchDiagnostics = Omit<PdfSearchPageDebug, 'indexedRangeCount' | 'indexedTextLength' | 'matchCount' | 'route'>;
type RenderSearchDiagnostics = Omit<
  PdfSearchPageDebug,
  'indexedRangeCount' | 'indexedTextLength' | 'matchCount' | 'renderedRangeCount' | 'renderedTextLength' | 'route'
>;
type SearchablePageEntry = {
  indexedEntry: PdfPageTextEntry;
  page: number;
  renderedSegments: ReturnType<typeof collectTextSegments>;
  shell: HTMLDivElement;
  text: string;
};

let lastPdfSearchDebug: PdfSearchPageDebug[] = [];

export function getLastPdfSearchDebug() {
  return lastPdfSearchDebug;
}

function buildFallbackMatch(page: number, shell: HTMLDivElement, position: number, index: number): PdfSearchMatch {
  return {
    element: shell,
    fragments: [{ element: shell, page, rects: [], x: null, y: null }],
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
    fragments: [{ element: geometry.element, page, rects: geometry.rects, x: geometry.x, y: geometry.y }],
    id: `${page}:${position}:${index}`,
    matchStart: position,
    page,
    rects: geometry.rects,
    x: geometry.x,
    y: geometry.y
  };
}

function collectIndexedPendingMatches(args: {
  diagnostics: BaseSearchDiagnostics;
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
  diagnostics: RenderSearchDiagnostics;
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

function collectPageSearchData(args: {
  debugPages: PdfSearchPageDebug[];
  diagnostics: BaseSearchDiagnostics;
  matches: PdfSearchMatch[];
  page: number;
  pageBounds: HTMLElement;
  pageTextByNumberRef?: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  query: string;
  searchablePages: SearchablePageEntry[];
  shell: HTMLDivElement;
}) {
  const segments = collectTextSegments(args.shell);
  if (segments.length > 0) {
    args.searchablePages.push({
      indexedEntry: { itemRanges: [], text: '' },
      page: args.page,
      renderedSegments: segments,
      shell: args.shell,
      text: segments.map((segment) => segment.text).join('')
    });
    const renderedResult = collectRenderedMatches({
      diagnostics: args.diagnostics,
      page: args.page,
      pageBounds: args.pageBounds,
      query: args.query,
      shell: args.shell
    });
    args.debugPages.push(renderedResult.debug);
    args.matches.push(...renderedResult.matches);
    return true;
  }

  const indexedEntry = resolveIndexedEntry(args.pageTextByNumberRef?.current[args.page]);
  const indexedPageText = indexedEntry.text.toLocaleLowerCase();
  if (indexedPageText.length === 0) {
    return false;
  }
  args.searchablePages.push({
    indexedEntry,
    page: args.page,
    renderedSegments: [],
    shell: args.shell,
    text: indexedEntry.text
  });
  const indexedResult = collectIndexedPendingMatches({
    diagnostics: args.diagnostics,
    indexedEntry,
    page: args.page,
    query: args.query,
    shell: args.shell
  });
  args.debugPages.push(indexedResult.debug);
  args.matches.push(...indexedResult.matches);
  return true;
}

function buildPageDiagnostics(page: number, pageBounds: HTMLElement, textLayer: HTMLElement | null): BaseSearchDiagnostics {
  return {
    hasTextLayer: !!textLayer,
    itemNodeCount: textLayer ? textLayer.querySelectorAll('span[role="presentation"], div[role="presentation"], span, div').length : 0,
    page,
    pageTextLength: (pageBounds.textContent ?? '').trim().length,
    renderedRangeCount: 0,
    renderedTextLength: 0,
    textLayerChildCount: textLayer?.childElementCount ?? 0,
    textLayerTextLength: (textLayer?.textContent ?? '').trim().length
  };
}

function buildNoMatchDebug(diagnostics: BaseSearchDiagnostics): PdfSearchPageDebug {
  return {
    ...diagnostics,
    indexedRangeCount: 0,
    indexedTextLength: 0,
    matchCount: 0,
    route: 'none'
  };
}

function sortMatches(matches: PdfSearchMatch[]) {
  return matches.sort((left, right) => left.page - right.page || left.matchStart - right.matchStart || left.id.localeCompare(right.id));
}

export function collectMatches(
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>,
  totalPages: number,
  query: string,
  pageTextByNumberRef?: MutableRefObject<Record<number, PdfPageTextEntry | string>>
): PdfSearchMatch[] {
  const matches: PdfSearchMatch[] = [];
  const debugPages: PdfSearchPageDebug[] = [];
  const searchablePages: SearchablePageEntry[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const shell = pageElementsRef.current[page];
    if (!shell) continue;

    const pageBounds = resolvePageBounds(shell);
    const textLayer = pageBounds.querySelector<HTMLElement>('.textLayer');
    const diagnostics = buildPageDiagnostics(page, pageBounds, textLayer);
    if (
      collectPageSearchData({
        debugPages,
        diagnostics,
        matches,
        page,
        pageBounds,
        query,
        searchablePages,
        shell,
        ...definedProps({ pageTextByNumberRef })
      })
    ) {
      continue;
    }
    debugPages.push(buildNoMatchDebug(diagnostics));
  }
  lastPdfSearchDebug = debugPages;
  return sortMatches([...matches, ...collectCrossPageMatches(searchablePages, query)]);
}
