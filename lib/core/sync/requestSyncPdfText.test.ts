import { expect, it, vi } from 'vitest';

import { attachmentRequestSchema } from './requestSyncAttachmentContract.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { exchangePdfTextArtifacts } from './requestSyncPdfText.js';

it('reserves one PDF attempt per bounded slice and does not starve later PDFs behind an unavailable extraction', async () => {
  const imported = vi.fn(async () => {});
  const host = pdfHost(imported);
  const keys = [`${'a'.repeat(64)}.pdf`, `${'b'.repeat(64)}.pdf`];
  const artifact = `${'c'.repeat(64)}.pdftext`;
  const describe = vi.fn(async (key: string) => attachmentRequestSchema.parse({
    operation: 'describe', requestId: new Uint8Array(16), storageKey: key,
    state: key === keys[0] ? 'end' : 'complete', derive: 'pdf_text', extractorVersion: 1,
    storageKeys: key === keys[0] ? [] : [artifact]
  }));
  const input = { host, keys, shouldYield: () => true, describe,
    pull: async () => ({ complete: true, blocks: 1 }), report: (_key: string, error: unknown) => { throw error; } };
  expect(await exchangePdfTextArtifacts(input)).toEqual({ blocks: 0, transferred: 0, pending: 2, verificationPending: false });
  expect(describe).toHaveBeenCalledTimes(1);
  expect(await exchangePdfTextArtifacts(input)).toEqual({ blocks: 1, transferred: 1, pending: 1, verificationPending: false });
  expect(describe).toHaveBeenCalledTimes(2);
  expect(imported).toHaveBeenCalledWith(keys[1], artifact);
});

function pdfHost(imported = vi.fn(async () => {})): RequestSyncAttachmentHost {
  return {
    importPdfText: imported,
    needs: async () => [], needsSlice: async () => ({ keys: [], pending: false }),
    status: async () => ({ kind: 'partial', offset: 0 }),
    receive: async () => { throw new Error('unused'); },
    withFile: async () => { throw new Error('unused'); }
  };
}

it.each([
  { state: 'end', pending: true, pulling: false, verifying: true, fails: false },
  { state: 'end', pending: false, pulling: false, verifying: false, fails: false },
  { state: 'complete', pending: false, pulling: true, verifying: true, fails: false },
  { state: 'complete', pending: false, pulling: false, verifying: false, fails: false },
  { state: 'complete', pending: false, pulling: false, verifying: false, fails: true }
])('distinguishes resumable verification from absent extraction and failure: %j', async scenario => {
  const key = `${'a'.repeat(64)}.pdf`, artifact = `${'b'.repeat(64)}.pdftext`;
  const report = vi.fn();
  const result = await exchangePdfTextArtifacts({ host: pdfHost(), keys: [key], shouldYield: () => false,
    describe: async () => attachmentRequestSchema.parse({ operation: 'describe', requestId: new Uint8Array(16),
      storageKey: key, state: scenario.state, pending: scenario.pending, extractorVersion: 1, storageKeys: [artifact] }),
    pull: async () => {
      if (scenario.fails) throw new Error('transport_failed');
      return { complete: false, blocks: 0, verificationPending: scenario.pulling };
    }, report });
  expect(result).toEqual({ transferred: 0, blocks: 0, pending: 1, verificationPending: scenario.verifying });
  expect(report).toHaveBeenCalledTimes(scenario.fails ? 1 : 0);
});
