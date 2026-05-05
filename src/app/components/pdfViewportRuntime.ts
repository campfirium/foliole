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
  setVisiblePage: (page: number) => void;
  totalPages: number | null;
  zoom: number;
}) {
  const runtime = usePdfViewportRuntimeState(args.pdfSource);
  usePageJumpEffect(args.pageJumpRequest, runtime.pageElementsRef, runtime.scrollContainerRef, args.totalPages, args.clearPageJumpRequest);
  useViewportTransformAnchor(args.rotation, runtime.scrollContainerRef, args.zoom);
  const handleScroll = useVisiblePageSync(args.page, runtime.pageElementsRef, runtime.scrollContainerRef, args.setVisiblePage, args.totalPages);
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

function usePdfViewportRuntimeState(pdfSource: string) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, PdfPageTextEntry | string>>({});
  const textLayerSignatureByPageRef = useRef<Record<number, string>>({});
  const [searchDebug, setSearchDebug] = useState<PdfSearchDebugInfo>({ pages: [] });
  const [searchHighlights, setSearchHighlights] = useState<PdfSearchVisualHighlight[]>([]);
  const [searchRevision, setSearchRevision] = useState(0);

  useEffect(() => {
    pageTextByNumberRef.current = {};
    textLayerSignatureByPageRef.current = {};
    setSearchDebug({ pages: [] });
    setSearchHighlights([]);
    refreshSearchRevision(setSearchRevision);
  }, [pdfSource]);

  return {
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchDebug,
    searchHighlights,
    searchRevision,
    setSearchDebug,
    setSearchHighlights,
    setSearchRevision,
    textLayerSignatureByPageRef
  };
}
