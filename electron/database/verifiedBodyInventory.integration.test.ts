// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateCompanionFramedSyncInventory } from '../../lib/core/database/framedSyncInventoryMigration.js';
import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { buildCanonicalExternalDocumentPayload } from '../../lib/core/sync/canonicalExternalResourcePayload.js';
import { readFramedSyncInventory, readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { alternativeForBody } from '../../lib/core/sync/topicTextState.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const timestamp = '2026-10-07T00:00:00.000Z';
const inventory = (host: ReturnType<typeof textDevice>) => host.sqlite.prepare('SELECT * FROM framed_sync_inventory ORDER BY object_id').all();

async function seedExternalInventory(host: ReturnType<typeof textDevice>, body: string, available: boolean) {
  const id = available ? 'readable' : 'unavailable';
  const payload = { content: available ? body : '', body_blob_hash: hashTextBody(body),
    content_hash: 'original-source-hash', document_id: id, extension: 'md', file_name: `${id}.md`,
    folder_id: 'folder', reference_json: null, reference_kind: 'local_path', relative_path: `${id}.md`, title: id };
  await applySyncObjectInTransaction(host.db, { object_type: 'external_document', object_id: id,
    content_hash: computeSyncContentHash('external_document', buildCanonicalExternalDocumentPayload(payload)), deleted_at: null,
    payload_json: JSON.stringify(payload), updated_at: timestamp });
}

it.each(['', '\ufeff中文😀\0Original'])('discovers owned node and external bodies after legacy caches are removed', async (body) => {
  const host = textDevice();
  try {
    await applySyncNodesWithDbPort(host.db, [textBranch('current', body, undefined, timestamp)]);
    await seedExternalInventory(host, body, true);
    await seedExternalInventory(host, 'Missing original', false);
    const before = await readFramedSyncInventory(host.db);
    const keys = before.map((entry) => ({ globalId: entry.globalId, objectType: entry.objectType }));
    const entries = await Promise.all(keys.map((key) => readFramedSyncInventoryEntry(host.db, key)));
    host.sqlite.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    expect(await readFramedSyncInventory(host.db)).toEqual(before);
    expect(await Promise.all(keys.map((key) => readFramedSyncInventoryEntry(host.db, key)))).toEqual(entries);
    expect(before.find((entry) => entry.globalId === 'readable')!.resourceHashes).toHaveLength(1);
    expect(before.find((entry) => entry.globalId === 'unavailable')!.resourceHashes).toEqual([]);
  } finally { host.sqlite.close(); }
});

it('preserves discovery identities, alternatives and current resources when only owned bodies remain', async () => {
  const original = textDevice();
  const owned = textDevice();
  try {
    const base = textBranch('base', 'Original', undefined, timestamp);
    const peer = textBranch('peer', 'Concurrent', undefined, timestamp);
    const entry = alternativeForBody(peer, timestamp);
    base.snapshot.text_alternatives = [entry];
    base.alternative_bodies = [{ hash: entry.body_blob_hash, text: peer.body_text! }];
    const resource = 'b'.repeat(64);
    base.snapshot.resource_references = JSON.stringify([{ storage_key: `${resource}.png`, role: 'image', original_name: null }]);
    for (const host of [original, owned]) {
      await recordFramedSyncResourceAvailability(host.db, [resource], true);
      await applySyncNodesWithDbPort(host.db, [base]);
    }
    owned.sqlite.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    expect(inventory(owned)).toEqual(inventory(original));
    const next = textBranch('next', '\ufeff---\r\nkey: value\r\n---\r\n' + 'x'.repeat(700_000), base,
      '2026-10-07T01:00:00.000Z');
    next.snapshot.resource_references = base.snapshot.resource_references;
    for (const host of [original, owned]) await applySyncNodesWithDbPort(host.db, [next]);
    expect(inventory(owned)).toEqual(inventory(original));
    expect(owned.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get('next')).toBe(next.body_text);
    expect(owned.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe(next.body_text);
    expect((await readFramedSyncInventoryEntry(owned.db, { globalId: 'topic', objectType: 'node' }))?.resourceHashes)
      .toContainEqual(new Uint8Array(Buffer.from(entry.body_blob_hash, 'hex')));
  } finally { original.sqlite.close(); owned.sqlite.close(); }
});

it.each(['', '\ufeffDeleted original 中文😀\r\n' + 'x'.repeat(700_000)])(
  'keeps deletion identity and its empty transport summary after body retirement', async (body) => {
    const host = textDevice();
    try {
      const record = textBranch('deletion', body, undefined, timestamp);
      record.is_tombstone = true;
      record.snapshot.deleted_at = timestamp;
      record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: body });
      await applySyncNodesWithDbPort(host.db, [record]);
      const before = inventory(host)[0] as { content_hash: string; frontier_json: string };
      host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
        snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', NULL) WHERE version_id = 'deletion'`).run();
      const after = inventory(host)[0] as typeof before;
      expect(after.content_hash).toBe(before.content_hash);
      expect(after.frontier_json).toBe(before.frontier_json);
      expect(host.sqlite.prepare("SELECT body_hash FROM framed_sync_version_summary WHERE version_id = 'deletion'").get())
        .toEqual({ body_hash: hashTextBody('') });
    } finally { host.sqlite.close(); }
  }
);

it('keeps empty readable bodies distinct from retired versions in summaries and discovery', async () => {
  const host = textDevice();
  try {
    const record = textBranch('empty', '', undefined, timestamp);
    await applySyncNodesWithDbPort(host.db, [record]);
    const retired = textBranch('retired', 'Retired', undefined, timestamp);
    retired.body_text = null;
    retired.snapshot.content = null;
    await upsertRemoteVersion(host.db, retired);
    expect(host.sqlite.prepare('SELECT version_id, body_hash FROM framed_sync_version_summary ORDER BY version_id').all())
      .toEqual([{ version_id: 'empty', body_hash: hashTextBody('') }, { version_id: 'retired', body_hash: null }]);
    const current = inventory(host)[0] as { frontier_json: string; resources_json: string };
    expect(JSON.parse(current.frontier_json)).toEqual(['empty', 'retired']);
    expect(JSON.parse(current.resources_json)).toEqual([hashTextBody('')]);
  } finally { host.sqlite.close(); }
});

it('rolls back inventory rebuilding without modifying owned bodies or triggers', async () => {
  const host = textDevice();
  try {
    await applySyncNodesWithDbPort(host.db, [textBranch('version', 'Preserved original', undefined, timestamp)]);
    const before = inventory(host);
    const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
    const triggers = host.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
    await expect(host.db.transaction(async (tx) => {
      await tx.run(`CREATE TRIGGER fail_inventory_rebuild BEFORE INSERT ON framed_sync_version_summary
        BEGIN SELECT RAISE(ABORT, 'inventory_unavailable'); END`);
      await migrateCompanionFramedSyncInventory(tx);
    })).rejects.toThrow('inventory_unavailable');
    expect(inventory(host)).toEqual(before);
    expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
    expect(host.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all()).toEqual(triggers);
  } finally { host.sqlite.close(); }
});
