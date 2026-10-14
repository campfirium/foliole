import type { PdfAnchorLocator, PdfSelectionLocator } from '../../features/nodes/model/nodeTypes';

import { resolvePdfSelectionClientRects } from './pdfSelectionClientRects';
import { intersectPdfTextLayerRange, resolvePdfSelectedPageNumbers } from './pdfSelectionPages';
import { resolvePdfRangeText } from './pdfSelectionRangeText';

function normalizedRects(range: Range, page: DOMRect) {
  if (page.width <= 0 || page.height <= 0) return [];
  const seen = new Set<string>();
  return resolvePdfSelectionClientRects(range).flatMap(rect => {
    const x = Math.max(0, (rect.left - page.left) / page.width);
    const y = Math.max(0, (rect.top - page.top) / page.height);
    const width = Math.min(1, (rect.right - page.left) / page.width) - x;
    const height = Math.min(1, (rect.bottom - page.top) / page.height) - y;
    if (width <= 0 || height <= 0) return [];
    const key = [x, y, width, height].map(value => Math.round(value * 10000)).join(':');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ x, y, width, height }];
  });
}

export function resolvePdfCrossPageSelection(container: HTMLElement, selection: Selection) {
  const pageNumbers = resolvePdfSelectedPageNumbers(container, selection);
  const range = selection.getRangeAt(0);
  const fragments: PdfAnchorLocator[] = [];
  const texts: string[] = [];
  for (const pageNumber of pageNumbers) {
    const shell = container.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`);
    const host = shell?.querySelector<HTMLElement>('[data-testid="pdf-official-text-layer"]');
    const layer = shell?.querySelector<HTMLElement>('.textLayer');
    if (!shell || !layer || (host && host.dataset.pdfTextLayerState !== 'ready')) return null;
    const fragment = intersectPdfTextLayerRange(range, layer);
    const text = fragment ? resolvePdfRangeText(fragment) : '';
    if (!text) continue;
    const frame = shell.querySelector<HTMLElement>('.react-pdf__Page,[data-testid="pdf-document-page"]') ?? shell;
    const rects = fragment ? normalizedRects(fragment, frame.getBoundingClientRect()) : [];
    const first = rects[0];
    if (!first) return null;
    fragments.push({ page: pageNumber, rects, x: first.x + first.width / 2, y: first.y + first.height / 2 });
    texts.push(text);
  }
  const first = fragments[0];
  if (!first) return null;
  const locator: PdfSelectionLocator = fragments.length === 1 ? first : {
    pages: fragments.map(fragment => ({ ...fragment, rects: fragment.rects ?? [] }))
  };
  return { locator, selectionText: texts.join('\n') };
}
