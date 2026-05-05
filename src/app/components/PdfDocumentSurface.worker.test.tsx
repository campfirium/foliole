import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import { mockPdfWorkerOptions } from '../../test/reactPdfMock';

it('pins worker to packaged pdfjs worker with explicit version and clears stale worker global', async () => {
  (globalThis as Record<string, unknown>).pdfjsWorker = { stale: true };

  vi.resetModules();
  await import('./PdfDocumentSurface');

  expect(mockPdfWorkerOptions.workerSrc).toContain('pdfjs-dist/build/pdf.worker.min.mjs');
  expect(mockPdfWorkerOptions.workerSrc).toContain('?v=5.4.296');
  expect('pdfjsWorker' in globalThis).toBe(false);
});
