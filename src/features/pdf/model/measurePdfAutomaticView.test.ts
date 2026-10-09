import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { afterEach, expect, it, vi } from 'vitest';

import { measurePdfAutomaticView } from './measurePdfAutomaticView';

afterEach(() => vi.restoreAllMocks());
function installRaster() {
  const data = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  for (let y = 20; y < 80; y++)
    for (let x = 10; x < 90; x++) {
      const offset = (y * 100 + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
    }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    getImageData: () => ({ data })
  } as unknown as CanvasRenderingContext2D);
}
function pdfWithPages(numPages: number) {
  const page = {
    getViewport: () => ({ width: 100, height: 100 }),
    render: () => ({ promise: Promise.resolve() }),
    getTextContent: async () => ({ items: [] })
  } as unknown as PDFPageProxy;
  const getPage = vi.fn(async () => page);
  const pdf = { numPages, getPage } as unknown as PDFDocumentProxy;
  return { pdf, getPage };
}
it('measures the first five pages of a longer PDF and combines their rendered content', async () => {
  installRaster();
  const { pdf, getPage } = pdfWithPages(12);
  const view = await measurePdfAutomaticView(pdf);
  expect(getPage.mock.calls).toEqual([[1], [2], [3], [4], [5]]);
  expect(view.x).toBeLessThan(.1);
  expect(view.y).toBeLessThan(.2);
  expect(view.x + view.width).toBeGreaterThan(.9);
  expect(view.y + view.height).toBeGreaterThan(.8);
  expect(view.width * view.height).toBeLessThan(1);
});
it('measures only the available page in a one-page PDF', async () => {
  installRaster();
  const { pdf, getPage } = pdfWithPages(1);
  await measurePdfAutomaticView(pdf);
  expect(getPage.mock.calls).toEqual([[1]]);
});
it('excludes an isolated page number when PDF text reports zero item height', async () => {
  const data = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  for (let y = 20; y < 60; y++) for (let x = 10; x < 90; x++) {
    const i = (y * 100 + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
  }
  for (let y = 84; y < 92; y++) for (let x = 48; x < 53; x++) {
    const i = (y * 100 + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getImageData: () => ({ data }) } as unknown as CanvasRenderingContext2D);
  const page = { getViewport: () => ({ width: 100, height: 100 }), render: () => ({ promise: Promise.resolve() }),
    getTextContent: async () => ({ items: [{ str: '1', transform: [12, 0, 0, 12, 48, 5], width: 6, height: 0 }] }) };
  const pdf = { numPages: 1, getPage: async () => page } as unknown as PDFDocumentProxy;
  const view = await measurePdfAutomaticView(pdf);
  expect(view.y + view.height).toBeLessThan(.8);
});
