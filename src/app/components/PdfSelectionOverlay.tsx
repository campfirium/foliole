import { pdfOverlayPath } from './pdfOverlayPath';
import { renderPdfOverlayMarker, type renderPdfOverlayRects } from './pdfOverlayRender';

type SelectionLocator = Parameters<typeof renderPdfOverlayRects>[0];

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
      <path d={pdfOverlayPath(locator.rects)} data-testid="pdf-selection-rect" fill="var(--app-selection-surface-color)" fillRule="nonzero" />
    </svg>
  );
}
