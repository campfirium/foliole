import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Page } from 'react-pdf';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton } from '../../../shared/ui';
import { measurePdfTextLayerCropBox, resolvePdfCropScale, type PdfCropBox } from '../model/pdfAutoCrop';

export function useElementWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  useEffect(() => {
    if (!element) return undefined;
    const updateWidth = () => setWidth(element.clientWidth || window.innerWidth);
    updateWidth();
    const frame = window.requestAnimationFrame(updateWidth);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    window.addEventListener('resize', updateWidth);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateWidth);
      observer.disconnect();
    };
  }, [element]);
  return { ref, width };
}

export function SimplePdfToolbar(props: {
  backLabel?: string;
  onBack?: () => void;
  onZoomIn(): void;
  onZoomOut(): void;
  totalPages: number | null;
  zoom: number;
}) {
  const t = useTranslation();
  return (
    <div className="sticky top-0 z-surface flex items-center justify-between gap-2 border-b border-companion-divider bg-companion-surface px-1 py-2">
      {props.onBack ? <AppButton onClick={props.onBack} variant="ghost">{props.backLabel ?? t('desktop.pdf.simple.backToText')}</AppButton> : <span aria-hidden="true" className="w-14" />}
      <span className="text-xs text-companion-text-secondary">
        {props.totalPages ? t(props.totalPages === 1 ? 'desktop.pdf.simple.pageCount.one' : 'desktop.pdf.simple.pageCount.many', { count: props.totalPages }) : '-'}
      </span>
      <div className="flex items-center gap-1">
        <AppButton onClick={props.onZoomOut} variant="ghost">-</AppButton>
        <span className="w-12 text-center text-xs text-companion-text-secondary">{props.zoom}%</span>
        <AppButton onClick={props.onZoomIn} variant="ghost">+</AppButton>
      </div>
    </div>
  );
}

export function SimplePdfPages(props: {
  cropBoxes: Record<number, PdfCropBox | null>;
  pageWidth: number | undefined;
  setCropBoxes: Dispatch<SetStateAction<Record<number, PdfCropBox | null>>>;
  totalPages: number | null;
}) {
  return Array.from({ length: props.totalPages ?? 0 }, (_, index) => (
    <SimplePdfPage
      cropBox={props.cropBoxes[index + 1] ?? null}
      key={index + 1}
      onCropBoxChange={(cropBox) => props.setCropBoxes((current) => ({ ...current, [index + 1]: cropBox }))}
      pageNumber={index + 1}
      width={props.pageWidth}
    />
  ));
}

export function SimplePdfPageStack(props: {
  cropBoxes: Record<number, PdfCropBox | null>;
  initialPage?: number;
  pageWidth: number | undefined;
  setCropBoxes: Dispatch<SetStateAction<Record<number, PdfCropBox | null>>>;
  totalPages: number | null;
}) {
  return (
    <div
      className="flex w-max min-w-full flex-col items-center gap-3"
      style={props.initialPage && props.initialPage > 1 ? { paddingBottom: 'calc(100dvh - 12rem)' } : undefined}
    >
      <SimplePdfPages
        cropBoxes={props.cropBoxes}
        pageWidth={props.pageWidth}
        setCropBoxes={props.setCropBoxes}
        totalPages={props.pageWidth === undefined ? null : props.totalPages}
      />
    </div>
  );
}

function SimplePdfPage(props: {
  cropBox: PdfCropBox | null;
  onCropBoxChange(cropBox: PdfCropBox | null): void;
  pageNumber: number;
  width: number | undefined;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const width = props.width ?? 1;
  const cropScale = props.cropBox ? resolvePdfCropScale(width, props.cropBox) : 1;
  const cropWidth = props.cropBox ? (props.cropBox.right - props.cropBox.left) * cropScale : props.width;
  const cropHeight = props.cropBox ? (props.cropBox.bottom - props.cropBox.top) * cropScale : undefined;
  return (
    <div className="overflow-hidden bg-companion-surface shadow-page" data-pdf-page={props.pageNumber} style={{ height: cropHeight, width: cropWidth }}>
      <div ref={pageRef} style={props.cropBox ? { marginLeft: -props.cropBox.left * cropScale, marginTop: -props.cropBox.top * cropScale, transform: `scale(${cropScale})`, transformOrigin: 'top left' } : undefined}>
        <Page
          inputRef={pageRef}
          onRenderTextLayerSuccess={() => {
            if (!props.cropBox) measureCropBoxAfterTextLayout(pageRef.current, props.onCropBoxChange);
          }}
          pageNumber={props.pageNumber}
          renderAnnotationLayer
          renderTextLayer
          {...(props.width !== undefined ? { width: props.width } : {})}
        />
      </div>
    </div>
  );
}

function measureCropBoxAfterTextLayout(element: HTMLElement | null, onChange: (cropBox: PdfCropBox | null) => void) {
  if (!element) return onChange(null);
  window.requestAnimationFrame(() => {
    const cropBox = measurePdfTextLayerCropBox(element);
    if (cropBox) return onChange(cropBox);
    window.setTimeout(() => onChange(measurePdfTextLayerCropBox(element)), 80);
  });
}
