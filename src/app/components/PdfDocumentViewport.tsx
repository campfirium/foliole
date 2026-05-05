import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

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
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSource: string;
  rotation: number;
  clearPageJumpRequest: (requestId: number) => void;
  setVisiblePage: (page: number) => void;
  totalPages: number | null;
  zoom: number;
}

export function PdfDocumentViewport({
  onContextMenu,
  loadError,
  maxPage,
  onNextPage,
  onLoadError,
  onLoadSuccess,
  onPageChange,
  onPreviousPage,
  onRotateClockwise,
  onZoomIn,
  onZoomOut,
  page,
  pageJumpRequest,
  pdfSource,
  rotation,
  clearPageJumpRequest,
  setVisiblePage,
  totalPages,
  zoom
}: PdfDocumentViewportProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, clearPageJumpRequest);
  useViewportTransformAnchor(rotation, scrollContainerRef, zoom);
  const handleScroll = useVisiblePageSync(page, pageElementsRef, scrollContainerRef, setVisiblePage, totalPages);

  if (loadError) {
    return <PdfDocumentErrorState loadError={loadError} />;
  }

  return (
    <PdfDocumentViewportContent
      handleContextMenu={onContextMenu}
      handleScroll={handleScroll}
      maxPage={maxPage}
      onLoadError={onLoadError}
      onLoadSuccess={onLoadSuccess}
      onNextPage={onNextPage}
      onPageChange={onPageChange}
      onPreviousPage={onPreviousPage}
      onRotateClockwise={onRotateClockwise}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      page={page}
      pageElementsRef={pageElementsRef}
      pdfSource={pdfSource}
      rotation={rotation}
      scrollContainerRef={scrollContainerRef}
      totalPages={totalPages}
      zoom={zoom}
    />
  );
}
