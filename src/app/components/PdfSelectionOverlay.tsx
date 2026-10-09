import { renderPdfOverlayMarker, type renderPdfOverlayRects } from './pdfOverlayRender';

type SelectionLocator = Parameters<typeof renderPdfOverlayRects>[0];

function selectionPath(rects: NonNullable<SelectionLocator['rects']>) {
  return rects.map(({ x, y, width, height }) => {
    const left = Math.max(0, Math.min(1, x));
    const top = Math.max(0, Math.min(1, y));
    const w = Math.max(0, Math.min(1, width));
    const h = Math.max(0, Math.min(1, height));
    return `M${left} ${top}h${w}v${h}h${-w}Z`;
  }).join('');
}

export function PdfSelectionOverlay({ locator, markerSize }: { locator: SelectionLocator; markerSize: number }) {
  if (!locator.rects?.length) {
    return (
      <div className="pointer-events-none absolute inset-0" data-pdf-selection-overlay="true">
        {renderPdfOverlayMarker(locator, markerSize,
          'pointer-events-none absolute z-surface-overlay -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--app-selection-surface-color)]',
          'pdf-selection-marker')}
      </div>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-surface-overlay h-full w-full"
      data-pdf-selection-overlay="true"
      preserveAspectRatio="none"
      viewBox="0 0 1 1"
    >
      <path d={selectionPath(locator.rects)} data-testid="pdf-selection-rect" fill="var(--app-selection-surface-color)" fillRule="nonzero" />
    </svg>
  );
}
