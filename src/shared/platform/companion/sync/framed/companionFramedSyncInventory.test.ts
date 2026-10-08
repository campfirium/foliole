// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../../../../electron/database/topicTextState.testSupport.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { hashTextBody } from '../../../../../../lib/core/database/textBodyHash.js';
import { buildCanonicalExternalDocumentPayload } from '../../../../../../lib/core/sync/canonicalExternalResourcePayload.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';

import { readCompanionFramedSyncInventory, readCompanionFramedSyncInventoryEntry } from './companionFramedSyncInventory.js';

it.each(['', '\ufeff中文😀\0Original'])('preserves serialized inventory with owned bodies and no legacy body cache', async (body) => {
  const host = textDevice();
  const timestamp = '2026-10-07T00:00:00.000Z';
  try {
    await applySyncNodesWithDbPort(host.db, [textBranch('current', body, undefined, timestamp)]);
    const payload = { content: body, body_blob_hash: hashTextBody(body), content_hash: 'source-hash', document_id: 'document',
      extension: 'md', file_name: 'document.md', folder_id: 'folder', reference_json: null,
      reference_kind: 'local_path', relative_path: 'document.md', title: 'Document' };
    await applySyncObjectInTransaction(host.db, { object_type: 'external_document', object_id: 'document',
      content_hash: computeSyncContentHash('external_document', buildCanonicalExternalDocumentPayload(payload)), deleted_at: null,
      payload_json: JSON.stringify(payload), updated_at: timestamp });
    const before = await readCompanionFramedSyncInventory(host.db);
    const keys = before.entries.map((entry) => ({ globalId: entry.global_id, objectType: entry.object_type }));
    const entries = await Promise.all(keys.map((key) => readCompanionFramedSyncInventoryEntry(host.db, key)));
    expect(before.entries.find((entry) => entry.global_id === 'document')!.resource_hashes).toEqual([hashTextBody(body)]);
    host.sqlite.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    expect(await readCompanionFramedSyncInventory(host.db)).toEqual(before);
    expect(await Promise.all(keys.map((key) => readCompanionFramedSyncInventoryEntry(host.db, key)))).toEqual(entries);
    expect(await readCompanionFramedSyncInventoryEntry(host.db,
      { globalId: 'missing', objectType: 'external_document' })).toBeNull();
  } finally { host.sqlite.close(); }
});
