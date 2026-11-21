import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';

import { measurePdfTextLayerCropBox, type PdfCropBox } from '../model/pdfAutoCrop';

export function useSimplePdfCropMeasurement(props: {
  cropBox: PdfCropBox | null;
  onCropBoxChange(cropBox: PdfCropBox | null): void;
  onLayoutReady?: (() => void) | undefined;
  pageNumber: number;
  pageRef: RefObject<HTMLDivElement | null>;
  width: number | undefined;
}) {
  const lifetime = useMemo(() => ({ active: true, cancel: () => {} }), [props.pageNumber, props.width]);
  useLayoutEffect(() => {
    lifetime.active = true;
    return () => { lifetime.active = false; lifetime.cancel(); };
  }, [lifetime]);
  // react-pdf redraws the whole text layer whenever this callback changes, so it changes only with the page or width.
  const latest = useRef(props);
  latest.current = props;
  return useCallback(() => {
    if (!lifetime.active) return;
    lifetime.cancel();
    const current = latest.current;
    if (current.cropBox) { current.onLayoutReady?.(); return; }
    lifetime.cancel = measureAfterTextLayout(current.pageRef.current, (cropBox) => {
      if (!lifetime.active) return;
      latest.current.onCropBoxChange(cropBox);
      latest.current.onLayoutReady?.();
    });
  }, [lifetime]);
}

function measureAfterTextLayout(element: HTMLElement | null, onChange: (cropBox: PdfCropBox | null) => void) {
  let active = true;
  let frame = 0;
  let timer = 0;
  if (!element) onChange(null);
  else frame = window.requestAnimationFrame(() => {
    if (!active) return;
    const cropBox = measurePdfTextLayerCropBox(element);
    if (cropBox) onChange(cropBox);
    else timer = window.setTimeout(() => {
      if (active) onChange(measurePdfTextLayerCropBox(element));
    }, 80);
  });
  return () => {
    active = false;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}
