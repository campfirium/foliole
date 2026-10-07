// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../../../../../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../../../../../lib/core/database/bodyContentOwnerMigration.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { hashTextBody } from '../../../../../../lib/core/database/textBodyHash.js';
import { migrateVerifiedBodyInventory } from '../../../../../../lib/core/database/verifiedBodyInventoryMigration.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { upsertTextBodyBlob } from '../../../../../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';

import { readCompanionFramedSyncInventory, readCompanionFramedSyncInventoryEntry } from './companionFramedSyncInventory.js';

it.each(['', '\ufeff中文😀\0Original'])('preserves serialized inventory with explicitly chunked bodies and no continuous table', async (body) => {
  const host = textDevice();
  const timestamp = '2026-10-07T00:00:00.000Z';
  try {
    await applySyncNodesWithDbPort(host.db, [textBranch('current', body, undefined, timestamp)]);
    const payload = { body_blob_hash: hashTextBody(body), content_hash: 'source-hash', document_id: 'document',
      extension: 'md', file_name: 'document.md', folder_id: 'folder', reference_json: null,
      reference_kind: 'local_path', relative_path: 'document.md', title: 'Document' };
    await upsertTextBodyBlob(host.db, body, timestamp, payload.body_blob_hash);
    await applySyncObjectInTransaction(host.db, { object_type: 'external_document', object_id: 'document',
      content_hash: computeSyncContentHash('external_document', payload), deleted_at: null,
      payload_json: JSON.stringify(payload), updated_at: timestamp });
    const before = await readCompanionFramedSyncInventory(host.db);
    const keys = before.entries.map((entry) => ({ globalId: entry.global_id, objectType: entry.object_type }));
    const entries = await Promise.all(keys.map((key) => readCompanionFramedSyncInventoryEntry(host.db, key)));
    expect(before.entries.find((entry) => entry.global_id === 'document')!.resource_hashes).toEqual([hashTextBody(body)]);
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
      await migrateVerifiedBodyInventory(tx);
      await tx.run('DROP TABLE content_blob_data');
    });
    expect(await readCompanionFramedSyncInventory(host.db, 'chunked')).toEqual(before);
    expect(await Promise.all(keys.map((key) => readCompanionFramedSyncInventoryEntry(host.db, key, 'chunked')))).toEqual(entries);
    expect(await readCompanionFramedSyncInventoryEntry(host.db,
      { globalId: 'missing', objectType: 'external_document' }, 'chunked')).toBeNull();
    await expect(readCompanionFramedSyncInventory(host.db)).rejects.toThrow('no such table: content_blob_data');
  } finally { host.sqlite.close(); }
});
