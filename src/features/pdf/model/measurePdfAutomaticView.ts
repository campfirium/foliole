import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import { resolveAutomaticPdfView, type PdfRasterSample } from './pdfAutoViewGeometry';
import { unionPdfViews, type PdfViewRect } from './pdfReadingView';

async function pageNumberCandidates(page: PDFPageProxy): Promise<PdfViewRect[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return [];
    const [a, b, c, d, x, baseline] = item.transform;
    if (b !== 0 || c !== 0 || a <= 0 || d <= 0) return [];
    const height = Math.max(item.height, Math.hypot(c, d));
    const y = viewport.height - baseline - height;
    return [
      {
        text: item.str.trim(),
        x: x / viewport.width,
        y: y / viewport.height,
        width: item.width / viewport.width,
        height: height / viewport.height
      }
    ];
  });
  const candidates: PdfViewRect[] = [];
  for (const item of items) {
    if (!/^\d{1,4}$/.test(item.text) || !(item.y < 0.1 || item.y + item.height > 0.9)) continue;
    const row = items.filter((other) => Math.abs(other.y - item.y) < item.height / 2);
    if (!/^\d{1,4}$/.test(row.map((other) => other.text).join(''))) continue;
    const rect = unionPdfViews(row);
    const padX = 3 / viewport.width,
      padY = 3 / viewport.height;
    candidates.push({
      x: Math.max(0, rect.x - padX),
      y: Math.max(0, rect.y - padY),
      width: Math.min(1, rect.x + rect.width + padX) - Math.max(0, rect.x - padX),
      height: Math.min(1, rect.y + rect.height + padY) - Math.max(0, rect.y - padY)
    });
  }
  return candidates;
}
async function samplePage(page: PDFPageProxy): Promise<PdfRasterSample> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({
    scale: Math.min(1, 1000 / Math.max(base.width, base.height))
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('PDF page measurement is unavailable.');
  await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
  const sample = {
    width: canvas.width,
    height: canvas.height,
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
    pageNumbers: await pageNumberCandidates(page)
  };
  canvas.width = 0;
  canvas.height = 0;
  return sample;
}
export async function measurePdfAutomaticView(pdf: PDFDocumentProxy) {
  const samples: PdfRasterSample[] = [];
  for (let number = 1; number <= Math.min(5, pdf.numPages); number++) {
    samples.push(await samplePage(await pdf.getPage(number)));
  }
  return resolveAutomaticPdfView(samples);
}
