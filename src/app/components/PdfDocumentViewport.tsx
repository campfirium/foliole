import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchRequest, PdfSearchStatus } from './PdfDocumentSearch';
import {
  PdfDocumentErrorState,
  PdfDocumentViewportContent,
  usePageJumpEffect,
  useViewportTransformAnchor,
  useVisiblePageSync
} from './PdfDocumentViewportParts';

interface PdfDocumentViewportProps {
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
  pdfSource: string;
  rotation: number;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchStatus: PdfSearchStatus;
  clearPageJumpRequest: (requestId: number) => void;
  setVisiblePage: (page: number) => void;
  totalPages: number | null;
  zoom: number;
}

function renderPdfViewportContent(args: {
  handleScroll: () => void;
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
} & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'pageJumpRequest' | 'setVisiblePage'>) {
  return (
    <PdfDocumentViewportContent
      handleContextMenu={args.onContextMenu}
      handleScroll={args.handleScroll}
      maxPage={args.maxPage}
      onLoadError={args.onLoadError}
      onLoadSuccess={args.onLoadSuccess}
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
      pdfSource={args.pdfSource}
      rotation={args.rotation}
      scrollContainerRef={args.scrollContainerRef}
      searchQuery={args.searchQuery}
      searchRequest={args.searchRequest}
      searchStatus={args.searchStatus}
      totalPages={args.totalPages}
      zoom={args.zoom}
    />
  );
}

export function PdfDocumentViewport(props: PdfDocumentViewportProps) {
  const { handleScroll, pageElementsRef, scrollContainerRef } = usePdfViewportRuntime(
    props.clearPageJumpRequest,
    props.page,
    props.pageJumpRequest,
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
      pageElementsRef={pageElementsRef}
      scrollContainerRef={scrollContainerRef}
      {...props}
    />
  );
}

function PdfDocumentViewportReady(
  props: {
    handleScroll: () => void;
    pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
    scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  } & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'pageJumpRequest' | 'setVisiblePage'>
) {
  return renderPdfViewportContent(props);
}

function usePdfViewportRuntime(
  clearPageJumpRequest: (requestId: number) => void,
  page: number,
  pageJumpRequest: PdfJumpRequest | null,
  rotation: number,
  setVisiblePage: (page: number) => void,
  totalPages: number | null,
  zoom: number
) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, clearPageJumpRequest);
  useViewportTransformAnchor(rotation, scrollContainerRef, zoom);
  const handleScroll = useVisiblePageSync(page, pageElementsRef, scrollContainerRef, setVisiblePage, totalPages);

  return { handleScroll, pageElementsRef, scrollContainerRef };
}
