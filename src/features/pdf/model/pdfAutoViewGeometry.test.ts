import { expect, it } from 'vitest';

import { inkBounds, resolveAutomaticPdfView, type PdfRasterSample } from './pdfAutoViewGeometry';
import type { PdfViewRect } from './pdfReadingView';

function sample(rects: PdfViewRect[], pageNumbers: PdfViewRect[] = []): PdfRasterSample {
  const width = 200,
    height = 200;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const rect of rects) {
    for (
      let y = Math.round(rect.y * height);
      y < Math.round((rect.y + rect.height) * height);
      y++
    ) {
      for (let x = Math.round(rect.x * width); x < Math.round((rect.x + rect.width) * width); x++) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  }
  return { width, height, data, pageNumbers };
}
const body = { x: 0.1, y: 0.15, width: 0.8, height: 0.65 };
const pageNumber = { x: 0.48, y: 0.94, width: 0.04, height: 0.02 };
it('removes isolated page numbers in matching positions while retaining footnotes and figures', () => {
  const footnote = { x: 0.55, y: 0.82, width: 0.35, height: 0.04 };
  const figure = { x: 0.04, y: 0.3, width: 0.05, height: 0.2 };
  const page = sample([body, footnote, figure, pageNumber], [pageNumber]);
  const crop = resolveAutomaticPdfView([page, page]);
  expect(crop.x).toBeLessThan(figure.x);
  expect(crop.y + crop.height).toBeGreaterThan(footnote.y + footnote.height);
  expect(crop.y + crop.height).toBeLessThan(pageNumber.y);
});
it('uses the same conservative range for all pages including a different first-page layout', () => {
  const title = { x: 0.05, y: 0.05, width: 0.9, height: 0.08 };
  const crop = resolveAutomaticPdfView([
    sample([title, body]),
    sample([body, pageNumber], [pageNumber])
  ]);
  expect(crop.y).toBeLessThan(title.y);
  expect(crop.y + crop.height).toBeGreaterThan(pageNumber.y + pageNumber.height);
});
it('removes a single-page isolated numeral but retains a numeral adjoining content', () => {
  const isolated = sample([body, pageNumber], [pageNumber]);
  expect(resolveAutomaticPdfView([isolated]).height).toBeLessThan(inkBounds(isolated).height);
  const nearBottom = { ...body, height: 0.77 };
  const close = sample([nearBottom, pageNumber], [pageNumber]);
  expect(resolveAutomaticPdfView([close])).toEqual(inkBounds(close));
});
it('keeps headers and footers that are not numeral candidates and protects blank pages', () => {
  const footer = { x: 0.1, y: 0.94, width: 0.8, height: 0.02 };
  const page = sample([body, footer]);
  expect(resolveAutomaticPdfView([page, page])).toEqual(inkBounds(page));
  expect(resolveAutomaticPdfView([sample([])])).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});
it('does not remove a numeral when artwork shares its peripheral band', () => {
  const artwork = { x: 0.05, y: 0.93, width: 0.1, height: 0.03 };
  const page = sample([body, artwork, pageNumber], [pageNumber]);
  expect(resolveAutomaticPdfView([page, page])).toEqual(inkBounds(page));
});
