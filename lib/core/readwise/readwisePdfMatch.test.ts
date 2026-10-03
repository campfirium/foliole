// @vitest-environment node

import { readFileSync } from 'node:fs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect, it } from 'vitest';

import { locateReadwiseTextInPdf, type PdfPageForMatch } from './readwisePdfMatch.js';

async function realPdfPages(): Promise<PdfPageForMatch[]> {
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWorkerFetch: false }).promise;
  try {
    const pages: PdfPageForMatch[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      pages.push({
        height: viewport.height,
        items: text.items.filter((item) => 'str' in item).map((item) => ({
          height: item.height, str: item.str, transform: item.transform, width: item.width
        })),
        page: number,
        width: viewport.width
      });
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

it('places a unique Reader text highlight on the page of a renderable original PDF', async () => {
  const pages = await realPdfPages();
  const locator = locateReadwiseTextInPdf(pages, 'alpha keyword');
  expect(locator?.page).toBe(1);
  expect(locator?.rects).toHaveLength(1);
  expect(locator?.rects[0]?.x).toBeGreaterThan(0);
  expect(locator?.rects[0]?.x).toBeGreaterThan(0.6);
  expect(locator?.rects[0]?.y).toBeGreaterThan(0);
  expect(locator?.rects[0]?.width).toBeGreaterThan(0);
  expect(locator?.rects[0]?.width).toBeLessThan(0.4);
  expect(locator?.rects[0]?.height).toBeGreaterThan(0);
});

it('leaves repeated, missing and unextractable text unpositioned', async () => {
  const pages = await realPdfPages();
  expect(locateReadwiseTextInPdf(pages, 'keyword')).toBeNull();
  expect(locateReadwiseTextInPdf(pages, 'only in Reader enhanced text')).toBeNull();
  expect(locateReadwiseTextInPdf([{ height: 792, items: [], page: 1, width: 612 }], 'scanned page')).toBeNull();
});
