import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchDebugInfo, PdfSearchRequest, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { usePageJumpEffect, useViewportTransformAnchor, useVisiblePageSync } from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';
import { isPdfSearchRuntimeActive } from './pdfSearchRuntimeActive';
import { resolveTextLayerRefreshSignature, shouldRefreshTextLayer } from './pdfTextLayerRefresh';

function scheduleSearchReflowRefresh(refresh: () => void) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(refresh);
    });
    return;
  }
  window.setTimeout(refresh, 0);
}

function refreshSearchRevision(setSearchRevision: Dispatch<SetStateAction<number>>) {
  setSearchRevision((current) => current + 1);
}

function handleSearchTextLayerRender(args: {
  pageNumber: number;
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  previousSignatures: Record<number, string>;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  setSearchRevision: Dispatch<SetStateAction<number>>;
}) {
  if (!isPdfSearchRuntimeActive({ searchQuery: args.searchQuery, searchRequest: args.searchRequest, searchTarget: args.searchTarget })) {
    return;
  }
  const shell = args.pageElementsRef.current[args.pageNumber];
  if (!shouldRefreshTextLayer({ pageNumber: args.pageNumber, previousSignatures: args.previousSignatures, shell })) {
    return;
  }
  args.previousSignatures[args.pageNumber] = resolveTextLayerRefreshSignature(shell) ?? '';
  refreshSearchRevision(args.setSearchRevision);
  scheduleSearchReflowRefresh(() => refreshSearchRevision(args.setSearchRevision));
}

function refreshExistingSearchTextLayers(args: {
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  previousSignatures: Record<number, string>;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  setSearchRevision: Dispatch<SetStateAction<number>>;
  totalPages: number | null;
}) {
  if (!args.totalPages) {
    return;
  }
  if (!isPdfSearchRuntimeActive({ searchQuery: args.searchQuery, searchRequest: args.searchRequest, searchTarget: args.searchTarget })) {
    return;
  }
  let refreshed = false;
  for (let pageNumber = 1; pageNumber <= args.totalPages; pageNumber += 1) {
    const shell = args.pageElementsRef.current[pageNumber];
    if (!shouldRefreshTextLayer({ pageNumber, previousSignatures: args.previousSignatures, shell })) {
      continue;
    }
    args.previousSignatures[pageNumber] = resolveTextLayerRefreshSignature(shell) ?? '';
    refreshed = true;
  }
  if (!refreshed) {
    return;
  }
  refreshSearchRevision(args.setSearchRevision);
  scheduleSearchReflowRefresh(() => refreshSearchRevision(args.setSearchRevision));
}

function handleSearchTextContentLoad(args: {
  pageNumber: number;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  setSearchRevision: Dispatch<SetStateAction<number>>;
  text: PdfPageTextEntry;
}) {
  const current = args.pageTextByNumberRef.current[args.pageNumber];
  if (typeof current !== 'string' && current?.text === args.text.text) {
    return;
  }
  args.pageTextByNumberRef.current[args.pageNumber] = args.text;
  if (!isPdfSearchRuntimeActive({ searchQuery: args.searchQuery, searchRequest: args.searchRequest, searchTarget: args.searchTarget })) {
    return;
  }
  refreshSearchRevision(args.setSearchRevision);
}

export function usePdfViewportRuntime(args: {
  clearPageJumpRequest: (requestId: number) => void;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSource: string;
  rotation: number;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  setVisibleLocation: (page: number, positionY: number) => void;
  totalPages: number | null;
  zoom: number;
}) {
  const runtime = usePdfViewportRuntimeState(args.page, args.pdfSource);
  usePageJumpEffect(args.pageJumpRequest, runtime.pageElementsRef, runtime.scrollContainerRef, args.totalPages, args.clearPageJumpRequest, runtime.programmaticPageJumpRef);
  useViewportTransformAnchor(args.rotation, runtime.scrollContainerRef, args.zoom);
  useRefreshSearchTextLayers(args, runtime);
  const handleScroll = useVisiblePageSync(
    runtime.pageElementsRef,
    runtime.scrollContainerRef,
    args.setVisibleLocation,
    args.totalPages,
    runtime.programmaticPageJumpRef,
    runtime.setVisiblePage
  );
  return {
    ...runtime,
    handleScroll,
    handleTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) =>
      handleSearchTextContentLoad({
        pageNumber,
        pageTextByNumberRef: runtime.pageTextByNumberRef,
        searchQuery: args.searchQuery,
        searchRequest: args.searchRequest,
        searchTarget: args.searchTarget,
        setSearchRevision: runtime.setSearchRevision,
        text
      }),
    handleTextLayerRender: (pageNumber: number) =>
      handleSearchTextLayerRender({
        pageElementsRef: runtime.pageElementsRef,
        pageNumber,
        previousSignatures: runtime.textLayerSignatureByPageRef.current,
        searchQuery: args.searchQuery,
        searchRequest: args.searchRequest,
        searchTarget: args.searchTarget,
        setSearchRevision: runtime.setSearchRevision
      })
  };
}

function useRefreshSearchTextLayers(
  args: Pick<Parameters<typeof usePdfViewportRuntime>[0], 'searchQuery' | 'searchRequest' | 'searchTarget' | 'totalPages'>,
  runtime: Pick<ReturnType<typeof usePdfViewportRuntimeState>, 'pageElementsRef' | 'setSearchRevision' | 'textLayerSignatureByPageRef'>
) {
  useEffect(() => {
    refreshExistingSearchTextLayers({
      pageElementsRef: runtime.pageElementsRef,
      previousSignatures: runtime.textLayerSignatureByPageRef.current,
      searchQuery: args.searchQuery,
      searchRequest: args.searchRequest,
      searchTarget: args.searchTarget,
      setSearchRevision: runtime.setSearchRevision,
      totalPages: args.totalPages
    });
  }, [args.searchQuery, args.searchRequest, args.searchTarget, args.totalPages, runtime.pageElementsRef, runtime.setSearchRevision, runtime.textLayerSignatureByPageRef]);
}

function usePdfViewportRuntimeState(page: number, pdfSource: string) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, PdfPageTextEntry | string>>({});
  const programmaticPageJumpRef = useRef<{ expiresAt: number; requestId: number; targetPage: number } | null>(null);
  const textLayerSignatureByPageRef = useRef<Record<number, string>>({});
  const [searchDebug, setSearchDebug] = useState<PdfSearchDebugInfo>({ pages: [] });
  const [searchHighlights, setSearchHighlights] = useState<PdfSearchVisualHighlight[]>([]);
  const [searchRevision, setSearchRevision] = useState(0);
  const [visiblePage, setVisiblePage] = useState(page);

  useEffect(() => {
    pageTextByNumberRef.current = {};
    textLayerSignatureByPageRef.current = {};
    setSearchDebug({ pages: [] });
    setSearchHighlights([]);
    setVisiblePage(page);
    refreshSearchRevision(setSearchRevision);
  }, [pdfSource]);

  return {
    pageElementsRef,
    pageTextByNumberRef,
    programmaticPageJumpRef,
    scrollContainerRef,
    searchDebug,
    searchHighlights,
    searchRevision,
    setSearchDebug,
    setSearchHighlights,
    setSearchRevision,
    setVisiblePage,
    textLayerSignatureByPageRef,
    visiblePage
  };
}
