import { useEffect, useState, type MutableRefObject } from 'react';

import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';

import type { PdfPageDimensions } from './pdfPageDimensions';
import { rotatePdfNormalizedRect } from './pdfVisualExcerptGeometry';

export function useFitWidthTargetWidth(scrollContainerRef: MutableRefObject<HTMLDivElement | null>, rotation = 0) {
  const view = usePdfReadingView();
  const cropWidth = view ? rotatePdfNormalizedRect(view.crop, rotation).width : 1;
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

  return targetWidth ? targetWidth / cropWidth : null;
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
