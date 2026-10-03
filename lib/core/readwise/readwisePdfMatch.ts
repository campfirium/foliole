import { searchPdfDocumentText } from '../pdf/pdfDocumentTextSearch.js';

export interface PdfTextItemForMatch {
  direction?: string;
  height: number;
  str: string;
  transform: number[];
  width: number;
}

export interface PdfPageForMatch {
  geometrySupported?: boolean;
  height: number;
  items: PdfTextItemForMatch[];
  page: number;
  width: number;
}

export interface ReadwisePdfLocator {
  page: number;
  rects: Array<{ height: number; width: number; x: number; y: number }>;
  x: number;
  y: number;
}

function itemRectangle(item: PdfTextItemForMatch, page: PdfPageForMatch, start: number, end: number) {
  const [scaleX, skewY, skewX, scaleY, left, baseline] = item.transform;
  if (page.geometrySupported === false || (item.direction && item.direction !== 'ltr') ||
    !item.str || !Number.isFinite(item.width) || item.width <= 0 ||
    !Number.isFinite(item.height) || item.height <= 0 ||
    !Number.isFinite(left) || !Number.isFinite(baseline) ||
    !Number.isFinite(scaleX) || !Number.isFinite(scaleY) ||
    Math.abs(skewX ?? 0) > 0.001 || Math.abs(skewY ?? 0) > 0.001 ||
    (scaleX ?? 0) <= 0 || (scaleY ?? 0) <= 0) return null;
  const x = ((left ?? 0) + item.width * start / item.str.length) / page.width;
  const right = ((left ?? 0) + item.width * end / item.str.length) / page.width;
  const y = (page.height - (baseline ?? 0) - item.height) / page.height;
  const bottom = (page.height - (baseline ?? 0)) / page.height;
  if (x < -0.002 || right > 1.002 || y < -0.002 || bottom > 1.002 || right <= x || bottom <= y) return null;
  const clippedX = Math.max(0, x);
  const clippedRight = Math.min(1, right);
  const clippedY = Math.max(0, y);
  const clippedBottom = Math.min(1, bottom);
  if (clippedRight <= clippedX || clippedBottom <= clippedY) return null;
  return { height: clippedBottom - clippedY, width: clippedRight - clippedX, x: clippedX, y: clippedY };
}

function geometryForRange(page: PdfPageForMatch, start: number, end: number) {
  const rects: ReadwisePdfLocator['rects'] = [];
  let offset = 0;
  for (const item of page.items) {
    const itemEnd = offset + item.str.length;
    const localStart = Math.max(0, start - offset);
    const localEnd = Math.min(item.str.length, end - offset);
    if (localEnd > localStart) {
      const rect = itemRectangle(item, page, localStart, localEnd);
      if (!rect) return null;
      rects.push(rect);
    }
    offset = itemEnd;
  }
  return rects.length > 0 ? rects : null;
}

export function locateReadwiseTextInPdf(pages: PdfPageForMatch[], text: string): ReadwisePdfLocator | null {
  if (!text.trim()) return null;
  const matches = searchPdfDocumentText(
    pages.map((page) => ({ page: page.page, text: page.items.map((item) => item.str).join('') })), text
  );
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match || match.fragments.length !== 1) return null;
  const fragment = match.fragments[0];
  const page = pages.find((candidate) => candidate.page === fragment?.page);
  if (!page || !fragment) return null;
  const rects = geometryForRange(page, fragment.start, fragment.end);
  const first = rects?.[0];
  return first && rects ? {
    page: page.page,
    rects,
    x: first.x + first.width / 2,
    y: first.y + first.height / 2
  } : null;
}
