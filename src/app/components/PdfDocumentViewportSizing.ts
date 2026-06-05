import { useEffect, useState, type MutableRefObject } from 'react';

import type { PdfPageDimensions } from './pdfPageDimensions';

export function useFitWidthTargetWidth(scrollContainerRef: MutableRefObject<HTMLDivElement | null>) {
  const [targetWidth, setTargetWidth] = useState<number | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const updateTargetWidth = () => {
      setTargetWidth(container.clientWidth > 48 ? Math.max(160, container.clientWidth - 48) : null);
    };
    updateTargetWidth();
    window.addEventListener('resize', updateTargetWidth);
    return () => window.removeEventListener('resize', updateTargetWidth);
  }, [scrollContainerRef]);

  return targetWidth;
}

export function useDisplayedPdfZoom(args: {
  fitWidthTargetWidth: number | null;
  visiblePage: number;
  zoom: number;
  zoomMode: 'custom' | 'fit-width';
}) {
  const [baseWidthByPage, setBaseWidthByPage] = useState<Record<number, number>>({});
  const visibleBaseWidth = baseWidthByPage[args.visiblePage];
  const displayedZoom =
    args.zoomMode === 'fit-width' && args.fitWidthTargetWidth && visibleBaseWidth
      ? Math.max(1, Math.round((args.fitWidthTargetWidth / visibleBaseWidth) * 100))
      : args.zoom;

  const handlePageLoadSuccess = (pageNumber: number, dimensions: PdfPageDimensions) => {
    setBaseWidthByPage((current) =>
      current[pageNumber] === dimensions.width ? current : { ...current, [pageNumber]: dimensions.width }
    );
  };

  return { displayedZoom, handlePageLoadSuccess };
}
