import type { PdfViewRect } from '../../features/pdf/model/pdfReadingView';

import type { PdfPageDimensions } from './pdfPageDimensions';
import { rotatePdfNormalizedRect } from './pdfVisualExcerptGeometry';

export function resolvePdfHeightFit(dimensions: PdfPageDimensions, range: PdfViewRect,
  viewportHeight: number, rotation: number) {
  const rect = rotatePdfNormalizedRect(range, rotation);
  const quarterTurn = rotation % 180 !== 0;
  const pageHeight = quarterTurn ? dimensions.width : dimensions.height;
  const pageWidth = quarterTurn ? dimensions.height : dimensions.width;
  const scale = Math.max(1, viewportHeight - 16) / (pageHeight * rect.height);
  return { zoom: scale * 100, pageHeight: pageHeight * scale, pageWidth: pageWidth * scale, rect };
}

export function alignPdfHeightFit(container: HTMLDivElement, shell: HTMLDivElement,
  fit: ReturnType<typeof resolvePdfHeightFit>) {
  const page = shell.querySelector('[data-testid="pdf-document-page-frame"]') ?? shell;
  const bounds = page.getBoundingClientRect();
  const viewport = container.getBoundingClientRect();
  const top = bounds.top - viewport.top + container.scrollTop + fit.pageHeight * fit.rect.y - 8;
  const left = bounds.left - viewport.left + container.scrollLeft +
    fit.pageWidth * (fit.rect.x + fit.rect.width / 2) - container.clientWidth / 2;
  container.scrollTop = Math.max(0, top);
  container.scrollLeft = Math.max(0, left);
}
