// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect, it, vi } from 'vitest';

import { readPdfTextPage } from './pdfPageTextExtraction.js';

it('extracts real PDF text and dimensions without ReadableStream async iteration', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { configurable: true, value: undefined });
  const bytes = await readFile('tests/desktop/fixtures/pdf-user-journey.pdf');
  const task = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true });
  try {
    const document = await task.promise;
    const pages = [];
    for (let page = 1; page <= document.numPages; page++) {
      pages.push(await readPdfTextPage(await document.getPage(page), page));
    }
    expect(pages).toHaveLength(3);
    expect(pages[0]).toMatchObject({ page: 1, pageWidth: 612, pageHeight: 792 });
    expect(pages[0]?.text).toContain('Page 1 alpha keyword');
    expect(pages[2]?.text).toContain('Page 3 gamma keyword');
  } finally {
    await task.destroy();
    if (descriptor) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, descriptor);
  }
});

it('keeps item order and empty-string joining across chunks and releases the reader', async () => {
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue({ items: [{ str: 'Alpha' }, {}, { str: ' ' }] });
    controller.enqueue({ items: [{ str: 'beta' }, null] });
    controller.close();
  } });
  const result = await readPdfTextPage({ streamTextContent: () => stream,
    getViewport: () => ({ width: 10, height: 20 }) }, 2);
  expect(result).toEqual({ page: 2, text: 'Alpha beta', pageWidth: 10, pageHeight: 20 });
  expect(stream.locked).toBe(false);
});

it('cancels a pending text read without returning a partial page', async () => {
  const cancel = vi.fn();
  const controller = new AbortController();
  const stream = new ReadableStream({ start(source) { source.enqueue({ items: [{ str: 'partial' }] }); }, cancel });
  const result = readPdfTextPage({ streamTextContent: () => stream,
    getViewport: () => ({ width: 10, height: 20 }) }, 1, controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});
