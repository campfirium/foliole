import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchRequest, PdfSearchStatus, PdfSearchTarget } from './PdfDocumentSearch';
import {
  PdfDocumentErrorState,
  PdfDocumentViewportContent,
  usePageJumpEffect,
  useViewportTransformAnchor,
  useVisiblePageSync
} from './PdfDocumentViewportParts';

interface PdfDocumentViewportProps {
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  loadError: string | null;
  maxPage: number;
  onNextPage: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  searchStatus: PdfSearchStatus;
  clearPageJumpRequest: (requestId: number) => void;
  setVisiblePage: (page: number) => void;
  totalPages: number | null;
  zoom: number;
}

function renderPdfViewportContent(args: {
  handleTextContentLoad: (pageNumber: number, text: string) => void;
  handleTextLayerRender: (pageNumber: number) => void;
  handleScroll: () => void;
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  pageTextByNumberRef: MutableRefObject<Record<number, string>>;
  searchRevision: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
} & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'pageJumpRequest' | 'setVisiblePage'>) {
  return (
    <PdfDocumentViewportContent
      handleContextMenu={args.onContextMenu}
      handleScroll={args.handleScroll}
      highlightLocators={args.highlightLocators}
      maxPage={args.maxPage}
      onLoadError={args.onLoadError}
      onLoadSuccess={args.onLoadSuccess}
      onTextContentLoad={args.handleTextContentLoad}
      onSearchStatusChange={args.onSearchStatusChange}
      onNextPage={args.onNextPage}
      onPageChange={args.onPageChange}
      onPreviousPage={args.onPreviousPage}
      onRotateClockwise={args.onRotateClockwise}
      onSearchQueryChange={args.onSearchQueryChange}
      onSearchRequest={args.onSearchRequest}
      onZoomIn={args.onZoomIn}
      onZoomOut={args.onZoomOut}
      page={args.page}
      pageElementsRef={args.pageElementsRef}
      pageTextByNumberRef={args.pageTextByNumberRef}
      pdfSelectionLocator={args.pdfSelectionLocator}
      pdfSource={args.pdfSource}
      rotation={args.rotation}
      searchIndexingHint={args.searchIndexingHint}
      scrollContainerRef={args.scrollContainerRef}
      searchQuery={args.searchQuery}
      searchRevision={args.searchRevision}
      searchRequest={args.searchRequest}
      searchTarget={args.searchTarget}
      searchStatus={args.searchStatus}
      totalPages={args.totalPages}
      onTextLayerRender={args.handleTextLayerRender}
      zoom={args.zoom}
    />
  );
}

export function PdfDocumentViewport(props: PdfDocumentViewportProps) {
  const { handleScroll, handleTextContentLoad, handleTextLayerRender, pageElementsRef, pageTextByNumberRef, scrollContainerRef, searchRevision } = usePdfViewportRuntime(
    props.clearPageJumpRequest,
    props.page,
    props.pageJumpRequest,
    props.pdfSource,
    props.rotation,
    props.setVisiblePage,
    props.totalPages,
    props.zoom
  );

  if (props.loadError) {
    return <PdfDocumentErrorState loadError={props.loadError} />;
  }

  return (
    <PdfDocumentViewportReady
      handleScroll={handleScroll}
      handleTextContentLoad={handleTextContentLoad}
      handleTextLayerRender={handleTextLayerRender}
      pageElementsRef={pageElementsRef}
      pageTextByNumberRef={pageTextByNumberRef}
      searchRevision={searchRevision}
      scrollContainerRef={scrollContainerRef}
      {...props}
    />
  );
}

function PdfDocumentViewportReady(
  props: {
    handleScroll: () => void;
    handleTextContentLoad: (pageNumber: number, text: string) => void;
    handleTextLayerRender: (pageNumber: number) => void;
    pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
    pageTextByNumberRef: MutableRefObject<Record<number, string>>;
    searchRevision: number;
    scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  } & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'pageJumpRequest' | 'setVisiblePage'>
) {
  return renderPdfViewportContent(props);
}

function usePdfViewportRuntime(
  clearPageJumpRequest: (requestId: number) => void,
  page: number,
  pageJumpRequest: PdfJumpRequest | null,
  pdfSource: string,
  rotation: number,
  setVisiblePage: (page: number) => void,
  totalPages: number | null,
  zoom: number
) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, string>>({});
  const renderedTextLayerPagesRef = useRef<Set<number>>(new Set());
  const [searchRevision, setSearchRevision] = useState(0);

  useEffect(() => {
    renderedTextLayerPagesRef.current.clear();
    pageTextByNumberRef.current = {};
    setSearchRevision((current) => current + 1);
  }, [pdfSource]);

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, totalPages, clearPageJumpRequest);
  useViewportTransformAnchor(rotation, scrollContainerRef, zoom);
  const handleScroll = useVisiblePageSync(page, pageElementsRef, scrollContainerRef, setVisiblePage, totalPages);
  const handleTextLayerRender = (pageNumber: number) => {
    if (renderedTextLayerPagesRef.current.has(pageNumber)) {
      return;
    }
    renderedTextLayerPagesRef.current.add(pageNumber);
    setSearchRevision((current) => current + 1);
  };
  const handleTextContentLoad = (pageNumber: number, text: string) => {
    if (pageTextByNumberRef.current[pageNumber] === text) {
      return;
    }
    pageTextByNumberRef.current[pageNumber] = text;
    setSearchRevision((current) => current + 1);
  };

  return { handleScroll, handleTextContentLoad, pageElementsRef, pageTextByNumberRef, searchRevision, scrollContainerRef, handleTextLayerRender };
}
