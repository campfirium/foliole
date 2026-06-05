import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  invalidateAttachmentResourceResolution,
  resolveRuntimeAttachmentResource
} from '../../../shared/platform/attachmentResources';
import { AppButton, AppEmptyState } from '../../../shared/ui';
import { measurePdfTextLayerCropBox, resolvePdfCropScale, type PdfCropBox } from '../model/pdfAutoCrop';
import { configurePdfWorker } from '../model/pdfWorker';

configurePdfWorker();

const PDF_ZOOM_MIN = 100;
const PDF_ZOOM_MAX = 220;
const PDF_ZOOM_STEP = 20;
const PDF_DEFAULT_FIT_RATIO = 0.78;

function useElementWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
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
  }, []);

  return { ref, width };
}

function useAttachmentPdfSource(
  attachmentId: string,
  onMissingResource?: (attachmentId: string) => Promise<void> | void
) {
  const [source, setSource] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading');

  useEffect(() => {
    let cancelled = false;
    let retriedAfterSync = false;
    setSource(null);
    setState('loading');
    async function resolvePdfSource() {
      const resolution = await resolveRuntimeAttachmentResource(`asset://${attachmentId}`);
      if (cancelled) {
        return;
      }
      if (resolution?.status === 'ready' && resolution.resource_url) {
        setSource(resolution.resource_url);
        setState('ready');
        return;
      }
      if (!retriedAfterSync && onMissingResource) {
        retriedAfterSync = true;
        try {
          await onMissingResource(attachmentId);
        } catch {
          setState('missing');
          return;
        }
        invalidateAttachmentResourceResolution(attachmentId);
        await resolvePdfSource();
        return;
      }
      setState('missing');
    }
    void resolvePdfSource();
    return () => {
      cancelled = true;
    };
  }, [attachmentId, onMissingResource]);

  return { source, state };
}

function clampPdfZoom(value: number) {
  return Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, value));
}

function renderSimplePdfPages(args: {
  cropBoxes: Record<number, PdfCropBox | null>;
  pageWidth: number | undefined;
  setCropBoxes: Dispatch<SetStateAction<Record<number, PdfCropBox | null>>>;
  totalPages: number | null;
}) {
  return Array.from({ length: args.totalPages ?? 0 }, (_, index) => (
    <SimplePdfPage
      cropBox={args.cropBoxes[index + 1] ?? null}
      key={index + 1}
      onCropBoxChange={(cropBox) => {
        args.setCropBoxes((current) => ({ ...current, [index + 1]: cropBox }));
      }}
      pageNumber={index + 1}
      width={args.pageWidth}
    />
  ));
}

function measureCropBoxAfterTextLayout(element: HTMLElement | null, onCropBoxChange: (cropBox: PdfCropBox | null) => void) {
  if (!element) {
    onCropBoxChange(null);
    return;
  }
  window.requestAnimationFrame(() => {
    const cropBox = measurePdfTextLayerCropBox(element);
    if (cropBox) {
      onCropBoxChange(cropBox);
      return;
    }
    window.setTimeout(() => onCropBoxChange(measurePdfTextLayerCropBox(element)), 80);
  });
}

function SimplePdfToolbar(props: {
  onBackToText?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  totalPages: number | null;
  zoom: number;
}) {
  const t = useTranslation();
  return (
    <div className="sticky top-0 z-surface flex items-center justify-between gap-2 border-b border-companion-divider bg-companion-surface px-1 py-2">
      {props.onBackToText ? (
        <AppButton onClick={props.onBackToText} variant="ghost">
          {t('desktop.pdf.simple.backToText')}
        </AppButton>
      ) : (
        <span aria-hidden="true" className="w-14" />
      )}
      <span className="text-xs text-companion-text-secondary">
        {props.totalPages ? t(props.totalPages === 1 ? 'desktop.pdf.simple.pageCount.one' : 'desktop.pdf.simple.pageCount.many', { count: props.totalPages }) : '-'}
      </span>
      <div className="flex items-center gap-1">
        <AppButton onClick={props.onZoomOut} variant="ghost">
          -
        </AppButton>
        <span className="w-12 text-center text-xs text-companion-text-secondary">{props.zoom}%</span>
        <AppButton onClick={props.onZoomIn} variant="ghost">
          +
        </AppButton>
      </div>
    </div>
  );
}

export function SimplePdfDocument(props: {
  attachmentId: string;
  onBackToText?: () => void;
  onMissingResource?: (attachmentId: string) => Promise<void> | void;
  title: string;
}) {
  const t = useTranslation();
  const { ref, width } = useElementWidth();
  const { source, state } = useAttachmentPdfSource(props.attachmentId, props.onMissingResource);
  const [loadFailed, setLoadFailed] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const [cropBoxes, setCropBoxes] = useState<Record<number, PdfCropBox | null>>({});
  const pageWidth = width > 0 ? Math.floor((width * PDF_DEFAULT_FIT_RATIO * zoom) / 100) : undefined;

  useEffect(() => {
    setLoadFailed(false);
    setCropBoxes({});
  }, [source, zoom]);

  if (state !== 'ready' || !source || loadFailed) {
    return (
      <section className="flex min-h-[calc(100dvh-9rem)] items-center justify-center py-6">
        <AppEmptyState
          description={state === 'loading' && !loadFailed ? t('desktop.pdf.simple.preparing.syncedFile') : t('desktop.pdf.simple.unavailable.description')}
          title={state === 'loading' && !loadFailed ? t('desktop.pdf.simple.preparing.title') : t('desktop.pdf.simple.unavailable.title')}
        />
      </section>
    );
  }

  return (
    <section aria-label={t('desktop.pdf.simple.readerLabel', { title: props.title })} className="pdf-document-surface flex min-h-[calc(100dvh-9rem)] flex-col" ref={ref}>
      <SimplePdfToolbar
        {...(props.onBackToText ? { onBackToText: props.onBackToText } : {})}
        onZoomIn={() => setZoom((current) => clampPdfZoom(current + PDF_ZOOM_STEP))}
        onZoomOut={() => setZoom((current) => clampPdfZoom(current - PDF_ZOOM_STEP))}
        totalPages={totalPages}
        zoom={zoom}
      />
      <div className="min-h-0 flex-1 overflow-auto py-3">
        <Document
          file={source}
          loading={<AppEmptyState description={t('desktop.pdf.simple.preparing.page')} title={t('desktop.pdf.simple.preparing.title')} />}
          noData={<AppEmptyState description={t('desktop.pdf.simple.noFile.description')} title={t('desktop.pdf.simple.noFile.title')} />}
          onLoadError={() => setLoadFailed(true)}
          onLoadSuccess={({ numPages }) => {
            setTotalPages(numPages);
          }}
        >
          <div className="flex w-max min-w-full flex-col items-center gap-3">{renderSimplePdfPages({ cropBoxes, pageWidth, setCropBoxes, totalPages })}</div>
        </Document>
      </div>
    </section>
  );
}

function SimplePdfPage(props: {
  cropBox: PdfCropBox | null;
  onCropBoxChange: (cropBox: PdfCropBox | null) => void;
  pageNumber: number;
  width: number | undefined;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const width = props.width ?? 1;
  const cropScale = props.cropBox ? resolvePdfCropScale(width, props.cropBox) : 1;
  const cropWidth = props.cropBox ? (props.cropBox.right - props.cropBox.left) * cropScale : props.width;
  const cropHeight = props.cropBox ? (props.cropBox.bottom - props.cropBox.top) * cropScale : undefined;

  return (
    <div className="overflow-hidden bg-companion-surface shadow-page" style={{ height: cropHeight, width: cropWidth }}>
      <div
        ref={pageRef}
        style={props.cropBox
          ? {
              marginLeft: -props.cropBox.left * cropScale,
              marginTop: -props.cropBox.top * cropScale,
              transform: `scale(${cropScale})`,
              transformOrigin: 'top left'
            }
          : undefined}
      >
        <Page
          inputRef={pageRef}
          onRenderTextLayerSuccess={() => {
            if (!props.cropBox) {
              measureCropBoxAfterTextLayout(pageRef.current, props.onCropBoxChange);
            }
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
