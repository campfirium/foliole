import { useCallback, useEffect, useRef, useState } from 'react';
import { Document } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { buildCanonicalAttachmentStorageKey } from '../../../../lib/platform/attachmentResource';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  invalidateAttachmentResourceResolution,
  resolveRuntimeAttachmentResource
} from '../../../shared/platform/attachmentResources';
import { AppButton, AppEmptyState } from '../../../shared/ui';
import { PDF_DOCUMENT_OPTIONS } from '../model/pdfDocumentOptions';
import { beginPdfReaderSession, notePdfReaderDocumentLoaded, notePdfReaderSourceResolved } from '../model/pdfReaderSession';
import { configurePdfWorker } from '../model/pdfWorker';

import { SimplePdfToolbar, useElementWidth } from './SimplePdfDocumentLayout';
import { SimplePdfPageStack } from './SimplePdfPageStack';
import type { SimplePdfPosition, SimplePdfPositionPersistence } from './useSimplePdfPosition';

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
  // Callers recreate this handler on every render; only a new attachment reloads the document.
  const missingResourceHandler = useRef(onMissingResource);
  missingResourceHandler.current = onMissingResource;

  useEffect(() => {
    let cancelled = false;
    let retriedAfterSync = false;
    setSource(null);
    setState('loading');
    const storageKey = buildCanonicalAttachmentStorageKey(attachmentId, 'application/pdf');
    async function resolvePdfSource() {
      if (!storageKey) {
        setState('missing');
        return;
      }
      const resolution = await resolveRuntimeAttachmentResource(`asset://${storageKey}`);
      if (cancelled) {
        return;
      }
      if (resolution?.status === 'ready' && resolution.resource_url) {
        notePdfReaderSourceResolved();
        setSource(resolution.resource_url);
        setState('ready');
        return;
      }
      const syncMissingResource = missingResourceHandler.current;
      if (!retriedAfterSync && syncMissingResource) {
        retriedAfterSync = true;
        try {
          await syncMissingResource(attachmentId);
        } catch {
          if (!cancelled) setState('missing');
          return;
        }
        if (cancelled) return;
        invalidateAttachmentResourceResolution(storageKey);
        await resolvePdfSource();
        return;
      }
      setState('missing');
    }
    void resolvePdfSource();
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return { source, state };
}

// Source resolution is asynchronous, so it always lands after this session has begun.
function usePdfReaderSession(attachmentId: string) {
  useEffect(() => beginPdfReaderSession(), [attachmentId]);
}

// Current page, explicit page jumps, zoom and rotation; rotation is a view setting and is not saved.
function useSimplePdfView(initialPage: number | undefined, persistence: SimplePdfPositionPersistence | undefined) {
  const initialPosition = initialPage === undefined ? persistence?.initial : undefined;
  const requestedPage = initialPage ?? initialPosition?.page;
  const [currentPage, setCurrentPage] = useState(requestedPage ?? 1);
  const [jump, setJump] = useState<{ page: number; revision: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(100);
  const onChange = persistence?.onChange;
  const onPositionChange = useCallback((position: SimplePdfPosition) => {
    setCurrentPage(position.page);
    onChange?.(position);
  }, [onChange]);
  const onJumpToPage = useCallback((page: number) => {
    setCurrentPage(page);
    setJump(current => ({ page, revision: (current?.revision ?? 0) + 1 }));
    onChange?.({ page, fraction: 0 });
  }, [onChange]);
  return {
    zoom,
    toolbar: {
      currentPage,
      onJumpToPage,
      onRotate: () => setRotation(current => (current + 90) % 360),
      onZoomIn: () => setZoom(current => clampPdfZoom(current + PDF_ZOOM_STEP)),
      onZoomOut: () => setZoom(current => clampPdfZoom(current - PDF_ZOOM_STEP)),
      zoom
    },
    stack: {
      focusedPage: requestedPage,
      initialPage: jump?.page ?? requestedPage,
      jumpRevision: jump?.revision ?? 0,
      persistence: { ...persistence, initial: jump ? { page: jump.page, fraction: 0 } : initialPosition, onChange: onPositionChange },
      rotation
    }
  };
}

function clampPdfZoom(value: number) {
  return Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, value));
}

function PdfDocumentFallback(props: {
  backLabel: string | undefined;
  isLoading: boolean;
  onBack: (() => void) | undefined;
}) {
  const t = useTranslation();
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col">
      {props.onBack ? (
        <div className="border-b border-companion-divider bg-companion-surface px-1 py-2">
          <AppButton onClick={props.onBack} variant="ghost">{props.backLabel ?? t('desktop.pdf.simple.backToText')}</AppButton>
        </div>
      ) : null}
      <AppEmptyState
        className="flex-1"
        description={props.isLoading ? t('desktop.pdf.simple.preparing.syncedFile') : t('desktop.pdf.simple.unavailable.description')}
        title={props.isLoading ? t('desktop.pdf.simple.preparing.title') : t('desktop.pdf.simple.unavailable.title')}
      />
    </section>
  );
}

export function SimplePdfDocument(props: {
  attachmentId: string;
  backLabel?: string;
  initialPage?: number;
  positionPersistence?: SimplePdfPositionPersistence | undefined;
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
  const view = useSimplePdfView(props.initialPage, props.positionPersistence);
  const pageWidth = width > 0 ? Math.floor((width * PDF_DEFAULT_FIT_RATIO * view.zoom) / 100) : undefined;
  usePdfReaderSession(props.attachmentId);

  useEffect(() => {
    setLoadFailed(false);
    setTotalPages(null);
  }, [source]);

  if (state !== 'ready' || !source || loadFailed) {
    return <PdfDocumentFallback backLabel={props.backLabel} isLoading={state === 'loading' && !loadFailed} onBack={props.onBackToText} />;
  }

  return (
    <section aria-label={t('desktop.pdf.simple.readerLabel', { title: props.title })} className="pdf-document-surface flex h-[calc(100vh-9rem)] min-h-0 flex-col supports-[height:100dvh]:h-[calc(100dvh-9rem)]" ref={ref}>
      <SimplePdfToolbar
        {...(props.backLabel ? { backLabel: props.backLabel } : {})}
        {...(props.onBackToText ? { onBack: props.onBackToText } : {})}
        {...view.toolbar}
        totalPages={totalPages}
      />
      <div className="min-h-0 flex-1 overflow-auto py-3" ref={scrollContainerRef}>
        <Document
          suspense={false}
          key={source}
          file={source}
          loading={<AppEmptyState description={t('desktop.pdf.simple.preparing.page')} title={t('desktop.pdf.simple.preparing.title')} />}
          noData={<AppEmptyState description={t('desktop.pdf.simple.noFile.description')} title={t('desktop.pdf.simple.noFile.title')} />}
          onLoadError={() => setLoadFailed(true)}
          onLoadSuccess={({ numPages }) => { notePdfReaderDocumentLoaded(); setTotalPages(numPages); }}
          options={PDF_DOCUMENT_OPTIONS}
        >
          {pageWidth && totalPages ? <SimplePdfPageStack
            key={source}
            {...view.stack}
            pageWidth={pageWidth}
            scrollRef={scrollContainerRef}
            totalPages={totalPages}
          /> : null}
        </Document>
      </div>
    </section>
  );
}
