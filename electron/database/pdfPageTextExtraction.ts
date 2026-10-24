import { promises as fs } from 'node:fs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { PdfPageForMatch } from '../../lib/core/readwise/readwisePdfMatch.js';

export interface ExtractedPdfPage {
  page: number;
  pageHeight: number | null;
  pageWidth: number | null;
  text: string;
}

export function toPdfDocumentData(bytes: Uint8Array) {
  return new Uint8Array(bytes);
}

function resolvePdfPageText(content: { items: unknown[] }) {
  return content.items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      return 'str' in item && typeof item.str === 'string' ? item.str : '';
    })
    .join('');
}

function resolvePdfPageDimensions(pdfPage: { getViewport: (input: { scale: number }) => { width?: number; height?: number } }) {
  const viewport = pdfPage.getViewport({ scale: 1 });
  if (
    typeof viewport.width !== 'number' ||
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    typeof viewport.height !== 'number' ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0
  ) {
    return null;
  }
  return { height: viewport.height, width: viewport.width };
}

type PdfPageProxy = Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>;

async function mapPdfPages<T>(bytes: Uint8Array, read: (pdfPage: PdfPageProxy, page: number) => Promise<T>) {
  const loadingTask = getDocument({
    data: toPdfDocumentData(bytes),
    isEvalSupported: false,
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
    await document.destroy();
  }
}

/** Reads every page's text; pdf.js parses in the calling thread, so the main process runs this in a worker. */
export async function extractPdfPageTextFromFile(filePath: string): Promise<ExtractedPdfPage[]> {
  return mapPdfPages(await fs.readFile(filePath), async (pdfPage, page) => {
    const textContent = await pdfPage.getTextContent();
    const pageDimensions = resolvePdfPageDimensions(pdfPage);
    return {
      page,
      pageHeight: pageDimensions?.height ?? null,
      pageWidth: pageDimensions?.width ?? null,
      text: resolvePdfPageText(textContent)
    };
  });
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
