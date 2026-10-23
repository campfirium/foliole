import { promises as fs } from 'node:fs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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

/** Reads every page's text; pdf.js parses in the calling thread, so the main process runs this in a worker. */
export async function extractPdfPageTextFromFile(filePath: string): Promise<ExtractedPdfPage[]> {
  const bytes = await fs.readFile(filePath);
  const loadingTask = getDocument({
    data: toPdfDocumentData(bytes),
    isEvalSupported: false,
    useWorkerFetch: false
  });
  const document = await loadingTask.promise;
  try {
    const pages: ExtractedPdfPage[] = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      const pdfPage = await document.getPage(page);
      const textContent = await pdfPage.getTextContent();
      const pageDimensions = resolvePdfPageDimensions(pdfPage);
      pages.push({
        page,
        pageHeight: pageDimensions?.height ?? null,
        pageWidth: pageDimensions?.width ?? null,
        text: resolvePdfPageText(textContent)
      });
    }
    return pages;
  } finally {
    await document.destroy();
  }
}
