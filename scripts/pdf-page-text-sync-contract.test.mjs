import { expect, it } from 'vitest';

import { FRAMED_SYNC_STATE_OBJECT_TYPES, isFramedSyncSharedStateObject } from '../lib/core/sync/framedSyncObjectStateInventory.ts';
import { importPdfTextArtifact } from '../lib/core/sync/pdfTextArtifact.ts';
import { SYNC_OBJECT_POLICIES } from '../lib/core/sync/syncObjectPolicy.ts';

it('keeps derived PDF pages outside database inventory', () => {
  expect(SYNC_OBJECT_POLICIES.some(policy => policy.objectType === 'pdf_page_text')).toBe(false);
  expect([...FRAMED_SYNC_STATE_OBJECT_TYPES]).not.toContain('pdf_page_text');
  expect(isFramedSyncSharedStateObject('pdf_page_text', 'pdf-1:2')).toBe(false);
});
it('rejects an unbound artifact before starting a database transaction', async () => {
  let writes = 0;
  const db = { transaction: async () => { writes++; } };
  const text = JSON.stringify({ pdf: 'a'.repeat(64), version: 1, pages: [] });
  await expect(importPdfTextArtifact(db, `${'b'.repeat(64)}.pdf`, `${'c'.repeat(64)}.pdftext`, text))
    .rejects.toThrow('pdf_text_artifact_invalid');
  expect(writes).toBe(0);
});
