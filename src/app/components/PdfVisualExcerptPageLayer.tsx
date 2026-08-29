import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, appFloatingSurfaceClassName } from '../../shared/ui';
import { normalizeContextMenuPosition } from '../contextCommands';

import { AnnotationNotePanel } from './AnnotationNotePanel';
import { setPdfVisualSelectionKind } from './pdfSurfaceRegistration';
import type { PdfNormalizedRect } from './pdfVisualExcerptGeometry';
import { resolveDisplayedExcerptRect, useOptionalPdfVisualExcerptRuntime, usePdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';
import { usePdfVisualExcerptPagePointerRouting, type PdfVisualExcerptPendingNote } from './usePdfVisualExcerptPagePointerRouting';

function rectStyle(rect: PdfNormalizedRect) {
  return {
    height: `${rect.height * 100}%`,
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`
  };
}

function ExcerptOutline(props: { nodeId: string; rect: PdfNormalizedRect; selected: boolean }) {
  return (
    <div
      className={props.selected ? 'pointer-events-none absolute z-surface-raised ring-2 ring-accent shadow-marker' : 'pointer-events-none absolute z-surface-raised ring-2 ring-accent/75'}
      data-pdf-highlight-node-id={props.nodeId}
      data-pdf-image-excerpt-node-id={props.nodeId}
      data-testid="pdf-image-excerpt-outline"
      style={rectStyle(props.rect)}
    />
  );
}

function CreationError(props: { pageNumber: number }) {
  const runtime = usePdfVisualExcerptRuntime();
  const t = useTranslation();
  if (runtime.error?.page !== props.pageNumber) return null;
  return (
    <div
      className={appFloatingSurfaceClassName('popover', 'pointer-events-auto absolute bottom-3 left-1/2 z-floating flex -translate-x-1/2 items-center gap-2 border-error/35 p-2 text-ui-sm text-error')}
      data-testid="pdf-image-excerpt-error"
      role="alert"
    >
      <span>{t('desktop.pdf.imageExcerpt.failed')}</span>
      {runtime.error.note === undefined ? (
        <AppButton disabled={runtime.creating} onClick={() => void runtime.retry()} size="sm" variant="ghost">
          {t('desktop.pdf.imageExcerpt.retry')}
        </AppButton>
      ) : null}
    </div>
  );
}

function PdfVisualExcerptNotePanel(props: { onClose: () => void; request: PdfVisualExcerptPendingNote }) {
  const runtime = usePdfVisualExcerptRuntime();
  const [draft, setDraft] = useState('');
  const savingRef = useRef(false);
  const position = normalizeContextMenuPosition(props.request.left, props.request.top);
  const save = async () => {
    const note = draft.trim();
    if (!note || savingRef.current) return;
    savingRef.current = true;
    const saved = await runtime.createAnnotatedDisplayedRect(props.request.page, props.request.rect, note);
    savingRef.current = false;
    if (saved) props.onClose();
  };
  const close = () => {
    runtime.clearCreationError();
    props.onClose();
  };
  return createPortal(<AnnotationNotePanel draft={draft} left={position.left} onCancel={close} onChange={setDraft} onSave={() => void save()} top={position.top} />, document.body);
}

function PdfVisualExcerptPageLayerContent(props: { pageNumber: number }) {
  const runtime = usePdfVisualExcerptRuntime();
  const locators = useMemo(
    () =>
      runtime.imageLocators
        .filter((locator) => locator.page === props.pageNumber)
        .flatMap((locator) =>
          locator.rects.map((rect) => ({
            nodeId: locator.nodeId,
            rect: resolveDisplayedExcerptRect(rect, runtime.rotation)
          }))
        ),
    [props.pageNumber, runtime.imageLocators, runtime.rotation]
  );
  const { layerRef, pendingNote, preview, setPendingNote } = usePdfVisualExcerptPagePointerRouting(props.pageNumber, locators);
  useEffect(() => {
    setPendingNote(null);
    setPdfVisualSelectionKind(null);
  }, [runtime.surfaceKey, setPendingNote]);
  const pending = runtime.pending?.page === props.pageNumber ? runtime.pending.rect : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-surface-raised" ref={layerRef}>
      {locators.map(({ nodeId, rect }, index) => (
        <ExcerptOutline key={`${nodeId}:${index}`} nodeId={nodeId} rect={rect} selected={runtime.selectedOutline?.nodeId === nodeId} />
      ))}
      {preview || pending ? <div className="absolute bg-accent/15 ring-2 ring-accent" style={rectStyle(preview ?? pending!)} /> : null}
      <CreationError pageNumber={props.pageNumber} />
      {pendingNote ? <PdfVisualExcerptNotePanel onClose={() => setPendingNote(null)} request={pendingNote} /> : null}
    </div>
  );
}

export function PdfVisualExcerptPageLayer(props: { pageNumber: number }) {
  const runtime = useOptionalPdfVisualExcerptRuntime();
  return runtime ? <PdfVisualExcerptPageLayerContent {...props} /> : null;
}
