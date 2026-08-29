import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppIconButton, appFloatingSurfaceClassName } from '../../shared/ui';

import { rectFromPointerDrag, type PdfNormalizedRect } from './pdfVisualExcerptGeometry';
import { findPdfExcerptNearEdge, resolvePdfVisualExcerptPointerAction } from './pdfVisualExcerptPointerRouting';
import { resolveDisplayedExcerptRect, useOptionalPdfVisualExcerptRuntime, usePdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

function rectStyle(rect: PdfNormalizedRect) {
  return { height: `${rect.height * 100}%`, left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%` };
}

function pointRatio(event: PointerEvent, element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
  };
}

function ExcerptOutline(props: { nodeId: string; rect: PdfNormalizedRect; selected: boolean }) {
  return <div className={props.selected
    ? 'pointer-events-none absolute z-surface-raised ring-2 ring-accent shadow-marker'
    : 'pointer-events-none absolute z-surface-raised ring-2 ring-accent/75'}
    data-pdf-image-excerpt-node-id={props.nodeId} data-testid="pdf-image-excerpt-outline" style={rectStyle(props.rect)} />;
}

function SelectedOutlineToolbar() {
  const runtime = usePdfVisualExcerptRuntime();
  const t = useTranslation();
  const selected = runtime.selectedOutline;
  if (!selected) return null;
  return (
    <div className={appFloatingSurfaceClassName('popover', 'pointer-events-auto absolute z-floating flex gap-1 p-1')}
      data-testid="pdf-image-excerpt-outline-toolbar" role="toolbar"
      style={{ left: `${selected.x * 100}%`, top: `${selected.y * 100}%`, transform: 'translate(-50%, 8px)' }}>
      <AppIconButton className="size-8" icon={<ExternalLink aria-hidden size={15} />} label={t('desktop.pdf.imageExcerpt.open')}
        onClick={() => runtime.openExcerpt(selected.nodeId)} />
      <AppIconButton className="size-8" icon={<Trash2 aria-hidden size={15} />} label={t('desktop.pdf.imageExcerpt.delete')}
        onClick={runtime.deleteSelectedOutline} />
    </div>
  );
}

function CreationError(props: { pageNumber: number }) {
  const runtime = usePdfVisualExcerptRuntime();
  const t = useTranslation();
  if (runtime.error?.page !== props.pageNumber) return null;
  return (
    <div className={appFloatingSurfaceClassName('popover', 'pointer-events-auto absolute bottom-3 left-1/2 z-floating flex -translate-x-1/2 items-center gap-2 border-error/35 p-2 text-ui-sm text-error')}
      data-testid="pdf-image-excerpt-error" role="alert">
      <span>{t('desktop.pdf.imageExcerpt.failed')}</span>
      <AppButton disabled={runtime.creating} onClick={() => void runtime.retry()} size="sm" variant="ghost">
        {t('desktop.pdf.imageExcerpt.retry')}
      </AppButton>
    </div>
  );
}

type PagePointerRuntime = ReturnType<typeof usePdfVisualExcerptRuntime>;
type PageDrag = { pointerId: number; start: { x: number; y: number } };

function listenForPagePointers(root: HTMLElement, handlers: {
  cancel: (event: PointerEvent) => void;
  down: (event: PointerEvent) => void;
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
}) {
  root.addEventListener('pointerdown', handlers.down, true);
  root.addEventListener('pointermove', handlers.move, true);
  root.addEventListener('pointerup', handlers.up, true);
  root.addEventListener('pointercancel', handlers.cancel, true);
  return () => {
    root.classList.remove('pdf-visual-excerpt-page', 'pdf-visual-excerpt-near-edge');
    root.removeEventListener('pointerdown', handlers.down, true);
    root.removeEventListener('pointermove', handlers.move, true);
    root.removeEventListener('pointerup', handlers.up, true);
    root.removeEventListener('pointercancel', handlers.cancel, true);
  };
}

function installPagePointerRouting(args: {
  dragRef: MutableRefObject<PageDrag | null>;
  locators: Array<{ nodeId: string; rect: PdfNormalizedRect }>;
  pageNumber: number;
  root: HTMLElement;
  runtime: PagePointerRuntime;
  setPreview: Dispatch<SetStateAction<PdfNormalizedRect | null>>;
}) {
    const { dragRef, locators, pageNumber, root, runtime, setPreview } = args;
    root.classList.add('pdf-visual-excerpt-page');
    const nearEdge = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      return findPdfExcerptNearEdge(pointRatio(event, root), locators, {
        x: 6 / Math.max(1, bounds.width), y: 6 / Math.max(1, bounds.height)
      });
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) {
        const point = pointRatio(event, root);
        setPreview(rectFromPointerDrag(drag.start.x, drag.start.y, point.x, point.y));
        return;
      }
      const action = resolvePdfVisualExcerptPointerAction(event.target, Boolean(nearEdge(event)));
      root.classList.toggle('pdf-visual-excerpt-near-edge', action === 'outline');
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const point = pointRatio(event, root);
      const outline = nearEdge(event);
      const action = resolvePdfVisualExcerptPointerAction(event.target, Boolean(outline));
      if (action === 'control') return;
      if (action === 'outline' && outline) {
        event.preventDefault(); event.stopPropagation();
        runtime.selectOutline({ nodeId: outline.nodeId, page: pageNumber, ...point });
        return;
      }
      runtime.clearOutlineSelection();
      if (action === 'text') return;
      event.preventDefault(); event.stopPropagation();
      dragRef.current = { pointerId: event.pointerId, start: point };
      setPreview({ ...point, height: 0, width: 0 });
      root.setPointerCapture(event.pointerId);
    };
    const finishDrag = (event: PointerEvent, create: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const point = pointRatio(event, root);
      const next = rectFromPointerDrag(drag.start.x, drag.start.y, point.x, point.y);
      dragRef.current = null; setPreview(null);
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
      const bounds = root.getBoundingClientRect();
      if (create && next.width * bounds.width >= 8 && next.height * bounds.height >= 8) void runtime.createDisplayedRect(pageNumber, next);
    };
    const onPointerUp = (event: PointerEvent) => finishDrag(event, true);
    const onPointerCancel = (event: PointerEvent) => finishDrag(event, false);
    return listenForPagePointers(root, { cancel: onPointerCancel, down: onPointerDown, move: onPointerMove, up: onPointerUp });
}

function usePagePointerRouting(pageNumber: number, locators: Array<{ nodeId: string; rect: PdfNormalizedRect }>) {
  const runtime = usePdfVisualExcerptRuntime();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<PageDrag | null>(null);
  const [preview, setPreview] = useState<PdfNormalizedRect | null>(null);
  useEffect(() => {
    const root = layerRef.current?.parentElement;
    return root ? installPagePointerRouting({ dragRef, locators, pageNumber, root, runtime, setPreview }) : undefined;
  }, [locators, pageNumber, runtime]);
  return { layerRef, preview };
}

function PdfVisualExcerptPageLayerContent(props: { pageNumber: number }) {
  const runtime = usePdfVisualExcerptRuntime();
  const locators = useMemo(() => runtime.imageLocators.filter((locator) => locator.page === props.pageNumber)
    .flatMap((locator) => locator.rects.map((rect) => ({ nodeId: locator.nodeId, rect: resolveDisplayedExcerptRect(rect, runtime.rotation) }))),
  [props.pageNumber, runtime.imageLocators, runtime.rotation]);
  const { layerRef, preview } = usePagePointerRouting(props.pageNumber, locators);
  const pending = runtime.pending?.page === props.pageNumber ? runtime.pending.rect : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-surface-raised" ref={layerRef}>
      {locators.map(({ nodeId, rect }, index) => <ExcerptOutline key={`${nodeId}:${index}`} nodeId={nodeId} rect={rect}
        selected={runtime.selectedOutline?.nodeId === nodeId} />)}
      {preview || pending ? <div className="absolute bg-accent/15 ring-2 ring-accent" style={rectStyle(preview ?? pending!)} /> : null}
      {runtime.selectedOutline?.page === props.pageNumber ? <SelectedOutlineToolbar /> : null}
      <CreationError pageNumber={props.pageNumber} />
    </div>
  );
}

export function PdfVisualExcerptPageLayer(props: { pageNumber: number }) {
  const runtime = useOptionalPdfVisualExcerptRuntime();
  return runtime ? <PdfVisualExcerptPageLayerContent {...props} /> : null;
}
