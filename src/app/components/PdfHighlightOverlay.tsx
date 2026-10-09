import { pdfOverlayPath } from './pdfOverlayPath';
import { renderPdfOverlayMarker, renderPdfOverlayRects } from './pdfOverlayRender';
import type { PdfPageDimensions } from './pdfPageDimensions';

type HighlightLocator = Parameters<typeof renderPdfOverlayRects>[0];

export function PdfHighlightOverlay({ locator, markerSize, pageDimensions, rotation }: {
  locator: HighlightLocator; markerSize: number; pageDimensions: PdfPageDimensions | undefined; rotation: number
}) {
  if (!locator.rects?.length) return renderPdfOverlayMarker(locator, markerSize);
  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-surface h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1 1"
      >
        <path d={pdfOverlayPath(locator.rects, pageDimensions, rotation)} data-testid="pdf-highlight-fill"
          fill="var(--app-highlight-surface-color)" fillRule="nonzero" />
      </svg>
      {renderPdfOverlayRects(locator, 'pointer-events-none absolute z-surface')}
    </>
  );
}
