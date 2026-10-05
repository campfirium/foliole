import { expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalExternalDocumentPayload } from '../../lib/core/sync/canonicalExternalResourcePayload.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackExternalDocumentsWithDbPort } from '../../lib/core/sync/syncPackExternalDocumentsExecutor.js';

it('applies external documents from the attached pack', async () => {
  const payload = buildCanonicalExternalDocumentPayload({ body_blob_hash: null,
    content_hash: 'body-hash', document_id: 'doc-1', extension: 'md', file_name: 'doc.md',
    folder_id: 'folder-1', reference_json: null, reference_kind: 'local_path',
    relative_path: 'doc.md', title: 'Doc' });
  const port = {
    query: vi.fn(async () => [{ ...payload, deleted_at: null,
      document_content_hash: payload.content_hash, object_id: payload.document_id,
      state_content_hash: computeSyncContentHash('external_document', payload) }]),
    run: vi.fn(async () => ({ changes: 3, lastInsertRowId: null }))
  } as unknown as DbPort;

  await expect(applySyncPackExternalDocumentsWithDbPort(port, { incomingAlias: 'incoming' })).resolves.toBe(3);
  expect(port.run).toHaveBeenCalledWith(expect.stringContaining('FROM incoming.external_documents'));
});

it.each([
  { deleted_at: null, state_content_hash: 'tampered-live' },
  { deleted_at: '2026-10-05', state_content_hash: computeSyncContentHash(
    'external_document', buildCanonicalSyncTombstone('another-document')
  ) }
])('rejects an external document row whose canonical hash is invalid', async (override) => {
  const port = { query: vi.fn(async () => [{ body_blob_hash: null,
    document_content_hash: 'body-hash', extension: 'md', file_name: 'doc.md', folder_id: 'folder-1',
    object_id: 'doc-1', reference_json: null, reference_kind: 'local_path', relative_path: 'doc.md',
    title: 'Doc', ...override }]), run: vi.fn() } as unknown as DbPort;

  await expect(applySyncPackExternalDocumentsWithDbPort(port, { incomingAlias: 'incoming' }))
    .rejects.toThrow('sync_content_hash_mismatch:external_document');
  expect(port.run).not.toHaveBeenCalled();
});
