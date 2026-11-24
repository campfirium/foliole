import type { PdfReadingView, PdfViewRect } from '../../../../lib/platform/pdfDocumentPreference';

export { pdfReadingViewSchema, pdfViewRectSchema, type PdfReadingView, type PdfViewRect }
  from '../../../../lib/platform/pdfDocumentPreference';

export const FULL_PDF_VIEW: PdfViewRect = { x: 0, y: 0, width: 1, height: 1 };
export const PDF_AUTOMATIC_VIEW_VERSION = 1;
export const DEFAULT_PDF_READING_VIEW: PdfReadingView = {
  mode: 'auto',
  automatic: null,
  manual: null
};

export function unionPdfViews(rects: PdfViewRect[]): PdfViewRect {
  if (!rects.length) return FULL_PDF_VIEW;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y
  };
}
