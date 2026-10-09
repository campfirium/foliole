import { resolvePdfOverlayCoverage } from './pdfOverlayCoverage';
import type { renderPdfOverlayRects } from './pdfOverlayRender';
import type { PdfPageDimensions } from './pdfPageDimensions';

export function pdfOverlayPath(rects: NonNullable<Parameters<typeof renderPdfOverlayRects>[0]['rects']>, pageDimensions?: PdfPageDimensions, rotation = 0) {
  const coverage = pageDimensions ? resolvePdfOverlayCoverage(rects, pageDimensions, rotation) : rects;
  return coverage.map(({ x, y, width, height }) => {
    const left = Math.max(0, Math.min(1, x));
    const top = Math.max(0, Math.min(1, y));
    const w = Math.max(0, Math.min(1, width));
    const h = Math.max(0, Math.min(1, height));
    return `M${left} ${top}h${w}v${h}h${-w}Z`;
  }).join('');
}
