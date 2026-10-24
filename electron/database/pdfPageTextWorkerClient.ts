import { Worker } from 'node:worker_threads';

import type { PdfPageForMatch } from '../../lib/core/readwise/readwisePdfMatch.js';

import type { ExtractedPdfPage } from './pdfPageTextExtraction.js';
import { runPdfPageTextRequest, type PdfPageTextRequest, type PdfPageTextResults } from './pdfPageTextRequest.js';

type PdfPageTextWorkerResult<T> = { ok: true; pages: T } | { message: string; ok: false };

const EXTRACTION_TIMEOUT_MS = 10 * 60_000;

function runOffMainThread<R extends PdfPageTextRequest>(request: R): Promise<PdfPageTextResults[R['operation']]> {
  // Unit tests stage pdf.js in-process; the worker path has its own integration tests.
  if (process.env.VITEST) return runPdfPageTextRequest(request);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdfPageTextWorker.js', import.meta.url), { workerData: request });
    let result: PdfPageTextWorkerResult<PdfPageTextResults[R['operation']]> | null = null;
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('PDF text extraction worker timed out.'));
    }, EXTRACTION_TIMEOUT_MS);
    worker.once('message', (message: typeof result) => { result = message; });
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

/** Extracts PDF page text in a worker so a long document never holds the desktop window. */
export function extractPdfPageTextOffMainThread(filePath: string): Promise<ExtractedPdfPage[]> {
  return runOffMainThread({ filePath, operation: 'page_text' });
}

/** Reads positioned PDF text for Readwise highlight placement in the same worker. */
export function extractPdfMatchPagesOffMainThread(bytes: Uint8Array): Promise<PdfPageForMatch[]> {
  return runOffMainThread({ bytes, operation: 'match_pages' });
}
