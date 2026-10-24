import { parentPort, workerData } from 'node:worker_threads';

import { runPdfPageTextRequest, type PdfPageTextRequest } from './pdfPageTextRequest.js';

runPdfPageTextRequest(workerData as PdfPageTextRequest).then(
  (pages) => parentPort?.postMessage({ ok: true, pages }),
  (error: unknown) => parentPort?.postMessage({
    message: error instanceof Error ? error.message : String(error),
    ok: false
  })
);
