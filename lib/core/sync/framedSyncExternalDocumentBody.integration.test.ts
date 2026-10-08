// @vitest-environment node
import { expect, it } from 'vitest';

import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { computeSyncContentHash } from '../database/syncState.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { loadFramedExternalDocumentBody, selectFramedExternalDocumentBody, withFramedExternalDocumentBody } from './framedSyncExternalDocumentBody.js';
import { selectFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import { framedSyncObjectStateFactId } from './framedSyncObjectStateInventory.js';
import { applySyncObjectInTransaction } from './syncObjectApplyExecutor.js';

const timestamp = '2026-10-08T00:00:00Z';
const key = { globalId: 'document', objectType: 'external_document' } as const;

it.each(['', '\ufeff中文😀\0', '中😀'.repeat(149796) + 'abcd'])('publishes and applies owned external bytes with the original state identity', async (body) => {
  const source = textDevice();
  const receiver = textDevice();
  try {
    const hash = hashTextBody(body);
    const payload = { body_blob_hash: hash, content_hash: 'original-source-hash', document_id: key.globalId,
      extension: 'md', file_name: 'original.md', folder_id: 'folder', reference_json: null,
      reference_kind: 'local_path', relative_path: 'original.md', title: 'Original' };
    const contentHash = computeSyncContentHash(key.objectType, payload);
    const record = { object_type: key.objectType, object_id: key.globalId, content_hash: contentHash,
      payload_json: JSON.stringify(payload), deleted_at: null, updated_at: timestamp };
    await applySyncObjectInTransaction(source.db, { ...record, payload_json: JSON.stringify({ ...payload, content: body }) });
    source.sqlite.exec('DROP TABLE content_blob_data');
    const fact = await selectFramedSyncObjectStateFact(source.db, key, framedSyncObjectStateFactId(key.objectType, contentHash, null));
    const descriptors = await selectFramedExternalDocumentBody(source.db, record.payload_json);
    expect(fact.blobs).toEqual(descriptors);
    expect(Buffer.from(await loadFramedExternalDocumentBody(source.db, key.globalId, descriptors[0]!)).toString('utf8')).toBe(body);
    await applySyncObjectInTransaction(receiver.db, record);
    const state = receiver.sqlite.prepare('SELECT * FROM sync_object_state WHERE object_id = ?').get(key.globalId);
    const complete = withFramedExternalDocumentBody(record, [{ hash, text: body }]);
    await receiver.db.transaction((tx) => applySyncObjectInTransaction(tx, complete));
    expect(receiver.sqlite.prepare('SELECT content = ? AS exact, body_blob_hash FROM external_documents').get(body))
      .toEqual({ exact: 1, body_blob_hash: hash });
    expect(receiver.sqlite.prepare('SELECT content_hash FROM sync_object_state WHERE object_id = ?').pluck().get(key.globalId))
      .toBe(contentHash);
    expect(receiver.sqlite.prepare('SELECT * FROM sync_object_state WHERE object_id = ?').get(key.globalId)).toEqual(state);
    expect(receiver.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    source.sqlite.prepare("UPDATE external_documents SET content = 'Drifted' WHERE document_id = ?").run(key.globalId);
    await expect(selectFramedExternalDocumentBody(source.db, record.payload_json)).rejects.toThrow('framed_sync_external_document_body_invalid');
    expect(() => withFramedExternalDocumentBody(record, [])).toThrow('framed_sync_external_document_body_invalid');
    expect(() => withFramedExternalDocumentBody(record, [{ hash, text: 'Corrupt' }])).toThrow('framed_sync_external_document_body_invalid');
    expect(await selectFramedExternalDocumentBody(source.db, null)).toEqual([]);
  } finally { source.sqlite.close(); receiver.sqlite.close(); }
});
