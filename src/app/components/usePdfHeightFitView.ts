import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { alignPdfHeightFit, resolvePdfHeightFit } from './pdfHeightFitGeometry';
import type { PdfPageDimensions } from './pdfPageDimensions';

interface HeightFitProps {
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  pageElementsRef: PdfPageElementsRef;
  pageJumpRequest: PdfJumpRequest | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  rotation: number;
  zoom: number;
  zoomMode: 'custom' | 'fit-width';
  onSetZoom: (zoom: number) => void;
  onSetFitWidth: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

function useViewportHeight(ref: MutableRefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const update = () => setHeight(container.clientHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

export function usePdfHeightFitView<T extends HeightFitProps>(props: T, ready: boolean) {
  const view = usePdfReadingView();
  const height = useViewportHeight(props.scrollContainerRef);
  const [dimensions, setDimensions] = useState(props.persistedPageDimensions);
  const page = view?.fitPage ?? 1;
  const size = dimensions[page] ?? props.persistedPageDimensions[page];
  const fit = view && view.ready && view.view.mode !== 'free' && size && height > 16
    ? resolvePdfHeightFit(size, view.range, height, props.rotation) : null;
  const key = fit ? `${view?.revision}:${props.rotation}:${height}:${fit.zoom}` : '';
  useFitAlignment(props, fit, page, key, ready);
  const release = (action: () => void) => {
    if (!view || view.view.mode === 'free') action();
    else void view.chooseFree().then((saved) => { if (saved) action(); });
  };
  return {
    registerDimensions: (number: number, next: PdfPageDimensions) => setDimensions((current) =>
      current[number]?.width === next.width && current[number]?.height === next.height
        ? current : { ...current, [number]: next }),
    props: {
      ...props,
      ...(fit ? { zoom: fit.zoom, zoomMode: 'custom' as const } : {}),
      onSetZoom: (zoom: number) => release(() => props.onSetZoom(zoom)),
      onSetFitWidth: () => release(props.onSetFitWidth),
      onZoomIn: () => release(() => fit ? props.onSetZoom(fit.zoom + 10) : props.onZoomIn()),
      onZoomOut: () => release(() => fit ? props.onSetZoom(fit.zoom - 10) : props.onZoomOut())
    }
  };
}

function useFitAlignment(props: HeightFitProps,
  fit: ReturnType<typeof resolvePdfHeightFit> | null, page: number, key: string, ready: boolean) {
  const applied = useRef('');
  useEffect(() => {
    const container = props.scrollContainerRef.current;
    const shell = props.pageElementsRef.current[page];
    if (!fit || !ready || props.pageJumpRequest || !container || !shell || applied.current === key) return;
    const frame = window.requestAnimationFrame(() => {
      alignPdfHeightFit(container, shell, fit);
      applied.current = key;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fit, key, page, props.pageElementsRef, props.pageJumpRequest, props.scrollContainerRef, ready]);
}
