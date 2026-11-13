import { useEffect, useState, type MutableRefObject } from 'react';

import type { PdfPageDimensions } from './pdfPageDimensions';

export const PDF_VIEWPORT_INLINE_PADDING = 48;

export function useFitWidthTargetWidth(scrollContainerRef: MutableRefObject<HTMLDivElement | null>) {
  const [targetWidth, setTargetWidth] = useState<number | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const updateTargetWidth = () => {
      setTargetWidth(container.clientWidth > PDF_VIEWPORT_INLINE_PADDING
        ? Math.max(160, container.clientWidth - PDF_VIEWPORT_INLINE_PADDING) : null);
    };
    updateTargetWidth();
    // The vertical scrollbar narrows the container after the first measurement.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateTargetWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  return targetWidth;
}

export function useDisplayedPdfZoom(args: {
  fitWidthTargetWidth: number | null;
  visiblePage: number;
  rotation: number;
  zoom: number;
  zoomMode: 'custom' | 'fit-width';
}) {
  const [dimensionsByPage, setDimensionsByPage] = useState<Record<number, PdfPageDimensions>>({});
  const dimensions = dimensionsByPage[args.visiblePage];
  const visibleBaseWidth = args.rotation % 180 === 0 ? dimensions?.width : dimensions?.height;
  const displayedZoom =
    args.zoomMode === 'fit-width' && args.fitWidthTargetWidth && visibleBaseWidth
      ? Math.max(1, Math.round((args.fitWidthTargetWidth / visibleBaseWidth) * 100))
      : Math.round(args.zoom);

  const handlePageLoadSuccess = (pageNumber: number, dimensions: PdfPageDimensions) => {
    setDimensionsByPage((current) =>
      current[pageNumber]?.width === dimensions.width && current[pageNumber]?.height === dimensions.height
        ? current : { ...current, [pageNumber]: dimensions }
    );
  };

  return { displayedZoom, handlePageLoadSuccess, visibleDimensions: dimensionsByPage[args.visiblePage] };
}
