import { promises as fs } from 'node:fs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { readPdfTextPage, type ExtractedPdfPage } from '../../lib/core/pdf/pdfPageTextExtraction.js';
import type { PdfPageForMatch } from '../../lib/core/readwise/readwisePdfMatch.js';

export type { ExtractedPdfPage };

export function toPdfDocumentData(bytes: Uint8Array) {
  return new Uint8Array(bytes);
}

type PdfPageProxy = Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>;

async function mapPdfPages<T>(bytes: Uint8Array, read: (pdfPage: PdfPageProxy, page: number) => Promise<T>) {
  const loadingTask = getDocument({
    data: toPdfDocumentData(bytes),
    useWorkerFetch: false
  });
  const document = await loadingTask.promise;
  try {
    const pages: T[] = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      pages.push(await read(await document.getPage(page), page));
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

/** Reads every page's text; pdf.js parses in the calling thread, so the main process runs this in a worker. */
export async function extractPdfPageTextFromFile(filePath: string): Promise<ExtractedPdfPage[]> {
  return mapPdfPages(await fs.readFile(filePath), readPdfTextPage);
}

/** Reads positioned text items so Readwise highlights can be matched to PDF page geometry. */
export function extractPdfMatchPages(bytes: Uint8Array): Promise<PdfPageForMatch[]> {
  return mapPdfPages(bytes, async (pdfPage, page) => {
    const viewport = pdfPage.getViewport({ scale: 1 });
    const content = await pdfPage.getTextContent();
    return {
      geometrySupported: viewport.transform.every((value, index) =>
        Math.abs(value - [1, 0, 0, -1, 0, viewport.height][index]!) < 0.001
      ),
      height: viewport.height,
      items: content.items.filter((item) => 'str' in item).map((item) => ({
        direction: item.dir, height: item.height, str: item.str, transform: item.transform, width: item.width
      })),
      page,
      width: viewport.width
    };
  });
}
