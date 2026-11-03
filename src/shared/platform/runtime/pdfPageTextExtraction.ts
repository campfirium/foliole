import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { readPdfTextPage, type ExtractedPdfPage } from '../../../../lib/core/pdf/pdfPageTextExtraction';

import { PDF_DOCUMENT_OPTIONS } from './pdfDocumentOptions';
import { configurePdfTextWorker } from './pdfTextWorkerUrl';

export async function extractRuntimePdfPageText(bytes: Uint8Array, signal?: AbortSignal): Promise<ExtractedPdfPage[]> {
  signal?.throwIfAborted();
  if (typeof document !== 'undefined') configurePdfTextWorker({ version, GlobalWorkerOptions });
  // pdf.js transfers this buffer to its worker; preserve the selected original for publication/retry.
  const task = getDocument({ ...PDF_DOCUMENT_OPTIONS, data: Uint8Array.from(bytes), useWorkerFetch: false });
  const abort = () => { void task.destroy().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const document = await task.promise;
    const pages: ExtractedPdfPage[] = [];
    for (let page = 1; page <= document.numPages; page++) {
      signal?.throwIfAborted();
      pages.push(await readPdfTextPage(await document.getPage(page), page, signal));
    }
    signal?.throwIfAborted();
    return pages;
  } finally {
    signal?.removeEventListener('abort', abort);
    await task.destroy();
  }
}
