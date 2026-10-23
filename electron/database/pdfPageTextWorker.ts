import { parentPort, workerData } from 'node:worker_threads';

import { extractPdfPageTextFromFile } from './pdfPageTextExtraction.js';

const { filePath } = workerData as { filePath: string };

extractPdfPageTextFromFile(filePath).then(
  (pages) => parentPort?.postMessage({ ok: true, pages }),
  (error: unknown) => parentPort?.postMessage({
    message: error instanceof Error ? error.message : String(error),
    ok: false
  })
);
