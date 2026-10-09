import type { PDFPageProxy } from 'pdfjs-dist';

import { unionPdfViews, type PdfViewRect } from '../../features/pdf/model/pdfReadingView';

import type { PdfRangeGuides } from './pdfViewRangeSnap';

export async function collectPdfViewContentGuides(page: PDFPageProxy, body: PdfViewRect): Promise<PdfRangeGuides> {
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  const content = await page.getTextContent();
  const rows: PdfViewRect[][] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const [a, b, c, d, x, baseline] = item.transform;
    if (b !== 0 || c !== 0 || a <= 0 || d <= 0) continue;
    const rect = { x: x / viewport.width, y: (viewport.height - baseline - item.height) / viewport.height,
      width: item.width / viewport.width, height: item.height / viewport.height };
    if (rect.y < body.y || rect.y + rect.height > body.y + body.height + 0.005) continue;
    const row = rows.find((group) => Math.abs((group[0]?.y ?? 0) - rect.y) < rect.height / 2);
    if (row) row.push(rect);
    else rows.push([rect]);
  }
  const boxes = [body, ...rows.map(unionPdfViews)];
  return {
    x: boxes.flatMap((rect) => [rect.x, rect.x + rect.width]),
    y: boxes.flatMap((rect) => [rect.y, rect.y + rect.height])
  };
}
