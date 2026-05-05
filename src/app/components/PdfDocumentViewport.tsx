import { useRef } from 'react';

import {
  PdfDocumentErrorState,
  PdfDocumentViewportContent,
  usePageJumpEffect,
  useViewportTransformAnchor,
  useVisiblePageSync
} from './PdfDocumentViewportParts';

interface PdfDocumentViewportProps {
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
  pageJumpRequest: number | null;
  pdfSource: string;
  rotation: number;
  setPageJumpRequest: (page: number | null) => void;
  setVisiblePage: (page: number) => void;
  totalPages: number | null;
  zoom: number;
}

export function PdfDocumentViewport({
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
  setPageJumpRequest,
  setVisiblePage,
  totalPages,
  zoom
}: PdfDocumentViewportProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, setPageJumpRequest);
  useViewportTransformAnchor(rotation, scrollContainerRef, zoom);
  const handleScroll = useVisiblePageSync(page, pageElementsRef, scrollContainerRef, setVisiblePage, totalPages);

  if (loadError) {
    return <PdfDocumentErrorState loadError={loadError} />;
  }

  return (
    <PdfDocumentViewportContent
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
