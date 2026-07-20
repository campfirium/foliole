import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Document } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  invalidateAttachmentResourceResolution,
  resolveRuntimeAttachmentResource
} from '../../../shared/platform/attachmentResources';
import { AppEmptyState } from '../../../shared/ui';
import type { PdfCropBox } from '../model/pdfAutoCrop';
import { configurePdfWorker } from '../model/pdfWorker';

import { SimplePdfPageStack, SimplePdfToolbar, useElementWidth } from './SimplePdfDocumentLayout';

configurePdfWorker();

const PDF_ZOOM_MIN = 100;
const PDF_ZOOM_MAX = 220;
const PDF_ZOOM_STEP = 20;
const PDF_DEFAULT_FIT_RATIO = 0.78;

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

function PdfDocumentFallback(props: { isLoading: boolean }) {
  const t = useTranslation();
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] items-center justify-center py-6">
      <AppEmptyState
        description={props.isLoading ? t('desktop.pdf.simple.preparing.syncedFile') : t('desktop.pdf.simple.unavailable.description')}
        title={props.isLoading ? t('desktop.pdf.simple.preparing.title') : t('desktop.pdf.simple.unavailable.title')}
      />
    </section>
  );
}

function useInitialPdfPageJump(args: {
  cropBoxes: Record<number, PdfCropBox | null>;
  initialPage: number | undefined;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  source: string | null;
  totalPages: number | null;
}) {
  const jumpedTargetRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const page = Math.min(Math.max(args.initialPage ?? 1, 1), args.totalPages ?? 1);
    if (!args.source || !args.totalPages || page === 1) return;
    const targetKey = `${args.source}:${page}`;
    const targetPagesReady = Array.from(
      { length: page },
      (_, index) => Object.prototype.hasOwnProperty.call(args.cropBoxes, index + 1)
    ).every(Boolean);
    if (!targetPagesReady || jumpedTargetRef.current === targetKey) return undefined;
    let frame = 0;
    let attempts = 0;
    const jumpWhenPositioned = () => {
      const scrollContainer = args.scrollContainerRef.current;
      const target = scrollContainer?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
      if (!target) return;
      const top = target.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
      if (top > 0) {
        scrollContainer.scrollTo({ top });
        jumpedTargetRef.current = targetKey;
        return;
      }
      attempts += 1;
      if (attempts < 6) frame = window.requestAnimationFrame(jumpWhenPositioned);
    };
    frame = window.requestAnimationFrame(jumpWhenPositioned);
    return () => window.cancelAnimationFrame(frame);
  }, [args.cropBoxes, args.initialPage, args.scrollContainerRef, args.source, args.totalPages]);
}


export function SimplePdfDocument(props: {
  attachmentId: string;
  backLabel?: string;
  initialPage?: number;
  onBackToText?: () => void;
  onMissingResource?: (attachmentId: string) => Promise<void> | void;
  title: string;
}) {
  const t = useTranslation();
  const { ref, width } = useElementWidth();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
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

  useInitialPdfPageJump({ cropBoxes, initialPage: props.initialPage, scrollContainerRef, source, totalPages });

  if (state !== 'ready' || !source || loadFailed) {
    return <PdfDocumentFallback isLoading={state === 'loading' && !loadFailed} />;
  }

  return (
    <section aria-label={t('desktop.pdf.simple.readerLabel', { title: props.title })} className="pdf-document-surface flex min-h-[calc(100dvh-9rem)] flex-col" ref={ref}>
      <SimplePdfToolbar
        {...(props.backLabel ? { backLabel: props.backLabel } : {})}
        {...(props.onBackToText ? { onBack: props.onBackToText } : {})}
        onZoomIn={() => setZoom((current) => clampPdfZoom(current + PDF_ZOOM_STEP))}
        onZoomOut={() => setZoom((current) => clampPdfZoom(current - PDF_ZOOM_STEP))}
        totalPages={totalPages}
        zoom={zoom}
      />
      <div className="min-h-0 flex-1 overflow-auto py-3" ref={scrollContainerRef}>
        <Document
          file={source}
          loading={<AppEmptyState description={t('desktop.pdf.simple.preparing.page')} title={t('desktop.pdf.simple.preparing.title')} />}
          noData={<AppEmptyState description={t('desktop.pdf.simple.noFile.description')} title={t('desktop.pdf.simple.noFile.title')} />}
          onLoadError={() => setLoadFailed(true)}
          onLoadSuccess={({ numPages }) => {
            setTotalPages(numPages);
          }}
        >
          <SimplePdfPageStack
            cropBoxes={cropBoxes}
            initialPage={props.initialPage}
            pageWidth={pageWidth}
            setCropBoxes={setCropBoxes}
            totalPages={totalPages}
          />
        </Document>
      </div>
    </section>
  );
}
