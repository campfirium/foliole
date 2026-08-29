import { useRef, useState, type PointerEvent } from 'react';

import { rectFromPointerDrag, type PdfNormalizedRect } from './pdfVisualExcerptGeometry';
import {
  resolveDisplayedExcerptRect,
  useOptionalPdfVisualExcerptRuntime,
  usePdfVisualExcerptRuntime
} from './PdfVisualExcerptRuntime';

function rectStyle(rect: PdfNormalizedRect) {
  return {
    height: `${rect.height * 100}%`, left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`, width: `${rect.width * 100}%`
  };
}

function pointerRatio(event: PointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
  };
}

function ExcerptOutline(props: { label: string; nodeId: string; rect: PdfNormalizedRect }) {
  const runtime = usePdfVisualExcerptRuntime();
  const common = {
    'aria-label': `Image excerpt: ${props.label}`,
    'data-pdf-image-excerpt-node-id': props.nodeId,
    onClick: () => runtime.openExcerpt(props.nodeId),
    type: 'button' as const
  };
  return (
    <div className="pointer-events-none absolute z-surface-raised ring-2 ring-accent" data-testid="pdf-image-excerpt-outline" style={rectStyle(props.rect)}>
      <button {...common} className="pointer-events-auto absolute -top-1 left-0 h-2 w-full" />
      <button {...common} aria-hidden className="pointer-events-auto absolute -bottom-1 left-0 h-2 w-full" tabIndex={-1} />
      <button {...common} aria-hidden className="pointer-events-auto absolute left-[-4px] top-0 h-full w-2" tabIndex={-1} />
      <button {...common} aria-hidden className="pointer-events-auto absolute right-[-4px] top-0 h-full w-2" tabIndex={-1} />
    </div>
  );
}

function PdfVisualExcerptPageLayerContent(props: { pageNumber: number }) {
  const runtime = usePdfVisualExcerptRuntime();
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<PdfNormalizedRect | null>(null);
  const draft = runtime.draft?.page === props.pageNumber
    ? resolveDisplayedExcerptRect(runtime.draft.rect, runtime.rotation)
    : null;
  const locators = runtime.imageLocators.filter((locator) => locator.page === props.pageNumber);
  return (
    <>
      {locators.flatMap((locator) => locator.rects.map((rect) => (
        <ExcerptOutline key={`${locator.id}:${rect.x}:${rect.y}`} label={locator.label} nodeId={locator.nodeId}
          rect={resolveDisplayedExcerptRect(rect, runtime.rotation)} />
      )))}
      {runtime.active ? (
        <div
          className="absolute inset-0 z-surface-raised cursor-crosshair touch-none select-none"
          data-testid="pdf-image-excerpt-selection-layer"
          onPointerDown={(event) => {
            const point = pointerRatio(event); startRef.current = point; setPreview({ ...point, width: 0, height: 0 });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!startRef.current) return;
            const point = pointerRatio(event);
            setPreview(rectFromPointerDrag(startRef.current.x, startRef.current.y, point.x, point.y));
          }}
          onPointerUp={(event) => {
            if (!startRef.current) return;
            const point = pointerRatio(event);
            const next = rectFromPointerDrag(startRef.current.x, startRef.current.y, point.x, point.y);
            startRef.current = null; setPreview(null);
            const bounds = event.currentTarget.getBoundingClientRect();
            if (next.width * bounds.width >= 8 && next.height * bounds.height >= 8) {
              runtime.selectDisplayedRect(props.pageNumber, next);
            }
          }}
        >
          {preview || draft ? <div className="absolute bg-accent/15 ring-2 ring-accent" style={rectStyle(preview ?? draft!)} /> : null}
        </div>
      ) : null}
    </>
  );
}

export function PdfVisualExcerptPageLayer(props: { pageNumber: number }) {
  const runtime = useOptionalPdfVisualExcerptRuntime();
  return runtime ? <PdfVisualExcerptPageLayerContent {...props} /> : null;
}
