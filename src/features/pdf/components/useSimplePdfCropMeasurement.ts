import { useLayoutEffect, useMemo, type RefObject } from 'react';

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
  return () => {
    if (!lifetime.active) return;
    lifetime.cancel();
    if (props.cropBox) { props.onLayoutReady?.(); return; }
    lifetime.cancel = measureAfterTextLayout(props.pageRef.current, (cropBox) => {
      if (!lifetime.active) return;
      props.onCropBoxChange(cropBox);
      props.onLayoutReady?.();
    });
  };
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
