import { Worker } from 'node:worker_threads';

import { extractPdfPageTextFromFile, type ExtractedPdfPage } from './pdfPageTextExtraction.js';

type PdfPageTextWorkerResult = { ok: true; pages: ExtractedPdfPage[] } | { message: string; ok: false };

const EXTRACTION_TIMEOUT_MS = 10 * 60_000;

/** Extracts PDF page text in a worker so a long document never holds the desktop window. */
export function extractPdfPageTextOffMainThread(filePath: string): Promise<ExtractedPdfPage[]> {
  // Unit tests stage pdf.js in-process; the worker path has its own integration test.
  if (process.env.VITEST) return extractPdfPageTextFromFile(filePath);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdfPageTextWorker.js', import.meta.url), { workerData: { filePath } });
    let result: PdfPageTextWorkerResult | null = null;
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('PDF text extraction worker timed out.'));
    }, EXTRACTION_TIMEOUT_MS);
    worker.once('message', (message: PdfPageTextWorkerResult) => { result = message; });
    worker.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timeout);
      if (!result) return reject(new Error(`PDF text extraction worker exited with code ${code}.`));
      if (!result.ok) return reject(new Error(result.message));
      resolve(result.pages);
    });
  });
}
