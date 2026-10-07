// @vitest-environment node
import { expect, it } from 'vitest';

import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../database/bodyContentOwnerMigration.js';
import { computeSyncContentHash } from '../database/syncState.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort, DbRow } from './dbPort.js';
import { selectFramedExternalDocumentBody } from './framedSyncExternalDocumentBody.js';
import { selectFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import { framedSyncObjectStateFactId } from './framedSyncObjectStateInventory.js';
import { upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from './syncObjectApplyExecutor.js';

const timestamp = '2026-10-07T00:00:00Z';
const key = { globalId: 'document', objectType: 'external_document' } as const;

async function seed(host: ReturnType<typeof textDevice>, body: string, available: boolean) {
  const hash = hashTextBody(body);
  const payload = { body_blob_hash: hash, content_hash: 'original-source-hash', document_id: key.globalId,
    extension: 'md', file_name: 'original.md', folder_id: 'folder', reference_json: null,
    reference_kind: 'local_path', relative_path: 'original.md', title: 'Original' };
  const contentHash = computeSyncContentHash(key.objectType, payload);
  if (available) await upsertTextBodyBlob(host.db, body, timestamp, hash);
  await applySyncObjectInTransaction(host.db, { object_type: key.objectType, object_id: key.globalId,
    content_hash: contentHash, payload_json: JSON.stringify(payload), deleted_at: null, updated_at: timestamp });
  return { payload: JSON.stringify(payload), factId: framedSyncObjectStateFactId(key.objectType, contentHash, null) };
}

function metadataOnly(db: DbPort): DbPort {
  return { ...db, query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
    if (sql.includes('content_blob_data') || sql.includes('content_body_chunks')) throw new Error('unexpected_body_query');
    const rows = await db.query<T>(sql, params);
    if (rows.some((row) => row.data instanceof Uint8Array || typeof row.data_hex === 'string')) {
      throw new Error('unexpected_body_bytes');
    }
    return rows;
  } };
}

it.each([
  { body: '', available: true },
  { body: '\ufeff中文😀\0'.repeat(500_000), available: true },
  { body: 'Unavailable original', available: false }
])('preserves external fact and descriptor with stable metadata only, available=$available', async ({ body, available }) => {
  const host = textDevice();
  try {
    const source = await seed(host, body, available);
    const before = await selectFramedSyncObjectStateFact(host.db, key, source.factId);
    const descriptors = await selectFramedExternalDocumentBody(host.db, source.payload);
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
      await tx.run('DROP TABLE content_blob_data');
    });
    const db = metadataOnly(host.db);
    expect(await selectFramedSyncObjectStateFact(db, key, source.factId, 'chunked')).toEqual(before);
    expect(await selectFramedExternalDocumentBody(db, source.payload, 'chunked')).toEqual(descriptors);
    if (!available) {
      host.sqlite.prepare('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)')
        .run(hashTextBody(body), Buffer.byteLength(body));
      expect(await selectFramedExternalDocumentBody(db, source.payload, 'chunked')).toEqual([]);
    }
    expect(await selectFramedExternalDocumentBody(db, null, 'chunked')).toEqual([]);
    await expect(selectFramedExternalDocumentBody(host.db, source.payload)).rejects.toThrow('no such table: content_blob_data');
  } finally { host.sqlite.close(); }
});
