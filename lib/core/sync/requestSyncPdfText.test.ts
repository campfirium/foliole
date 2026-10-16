import { expect, it, vi } from 'vitest';

import { attachmentRequestSchema } from './requestSyncAttachmentContract.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { exchangePdfTextArtifacts } from './requestSyncPdfText.js';

it('reserves one PDF attempt per bounded slice and does not starve later PDFs behind an unavailable extraction', async () => {
  const imported = vi.fn(async () => {});
  const host: RequestSyncAttachmentHost = {
    importPdfText: imported,
    needs: async () => [], needsSlice: async () => ({ keys: [], pending: false }),
    status: async () => ({ kind: 'partial', offset: 0 }),
    receive: async () => { throw new Error('unused'); },
    withFile: async () => { throw new Error('unused'); }
  };
  const keys = [`${'a'.repeat(64)}.pdf`, `${'b'.repeat(64)}.pdf`];
  const artifact = `${'c'.repeat(64)}.pdftext`;
  const describe = vi.fn(async (key: string) => attachmentRequestSchema.parse({
    operation: 'describe', requestId: new Uint8Array(16), storageKey: key,
    state: key === keys[0] ? 'end' : 'complete', derive: 'pdf_text', extractorVersion: 1,
    storageKeys: key === keys[0] ? [] : [artifact]
  }));
  const input = { host, keys, shouldYield: () => true, describe,
    pull: async () => ({ complete: true, blocks: 1 }), report: (_key: string, error: unknown) => { throw error; } };
  expect(await exchangePdfTextArtifacts(input)).toEqual({ blocks: 0, transferred: 0, pending: 2 });
  expect(describe).toHaveBeenCalledTimes(1);
  expect(await exchangePdfTextArtifacts(input)).toEqual({ blocks: 1, transferred: 1, pending: 1 });
  expect(describe).toHaveBeenCalledTimes(2);
  expect(imported).toHaveBeenCalledWith(keys[1], artifact);
});
