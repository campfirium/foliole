import type { PDFPageProxy } from 'pdfjs-dist';

import type { PdfNormalizedRect } from './pdfVisualExcerptGeometry';

const MAX_DIMENSION = 4096;
const MAX_PIXELS = 8_000_000;
const TARGET_LONG_EDGE = 1800;

export function resolvePdfExcerptRenderScale(width: number, height: number, rect: PdfNormalizedRect) {
  const regionWidth = Math.max(1, width * rect.width);
  const regionHeight = Math.max(1, height * rect.height);
  const preferred = TARGET_LONG_EDGE / Math.max(regionWidth, regionHeight);
  const dimensionLimit = MAX_DIMENSION / Math.max(regionWidth, regionHeight);
  const pixelLimit = Math.sqrt(MAX_PIXELS / (regionWidth * regionHeight));
  return Math.max(0.1, Math.min(6, preferred, dimensionLimit, pixelLimit));
}

export async function renderPdfVisualExcerpt(page: PDFPageProxy, rect: PdfNormalizedRect) {
  const baseViewport = page.getViewport({ rotation: 0, scale: 1 });
  const scale = resolvePdfExcerptRenderScale(baseViewport.width, baseViewport.height, rect);
  const viewport = page.getViewport({ rotation: 0, scale });
  const left = rect.x * viewport.width;
  const top = rect.y * viewport.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * viewport.width));
  canvas.height = Math.max(1, Math.round(rect.height * viewport.height));
  const canvasContext = canvas.getContext('2d', { alpha: false });
  if (!canvasContext) throw new Error('PDF image excerpt canvas is unavailable.');
  await page.render({
    canvas,
    canvasContext,
    transform: [1, 0, 0, 1, -left, -top],
    viewport
  }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PDF image excerpt could not be encoded.');
  return new Uint8Array(await blob.arrayBuffer());
}
