// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { migrateVerifiedBodyInventory } from '../../lib/core/database/verifiedBodyInventoryMigration.js';
import { readFramedSyncInventory, readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { writeVerifiedCurrentNode } from '../../lib/core/sync/syncNodeVerifiedCurrentWrite.js';
import { upsertVerifiedSyncNodeVersion } from '../../lib/core/sync/syncNodeVerifiedVersionWrite.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { alternativeForBody } from '../../lib/core/sync/topicTextState.js';

import { referencedNode } from './syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const timestamp = '2026-10-07T00:00:00.000Z';
const inventory = (host: ReturnType<typeof textDevice>) => host.sqlite.prepare('SELECT * FROM framed_sync_inventory ORDER BY object_id').all();

async function seedExternalInventory(host: ReturnType<typeof textDevice>, body: string, available: boolean) {
  const id = available ? 'readable' : 'unavailable';
  const hash = hashTextBody(body);
  const payload = { body_blob_hash: hash, content_hash: 'original-source-hash', document_id: id,
    extension: 'md', file_name: `${id}.md`, folder_id: 'folder', reference_json: null,
    reference_kind: 'local_path', relative_path: `${id}.md`, title: id };
  if (available) await upsertTextBodyBlob(host.db, body, timestamp, hash);
  await applySyncObjectInTransaction(host.db, { object_type: 'external_document', object_id: id,
    content_hash: computeSyncContentHash('external_document', payload), deleted_at: null,
    payload_json: JSON.stringify(payload), updated_at: timestamp });
  return hash;
}

it.each(['', '\ufeff中文😀\0Original'])('reads the same complete inventory and entries after continuous storage is removed', async (body) => {
  const host = textDevice();
  try {
    await applySyncNodesWithDbPort(host.db, [textBranch('current', body, undefined, timestamp)]);
    await seedExternalInventory(host, body, true);
    const missingHash = await seedExternalInventory(host, 'Missing original', false);
    const before = await readFramedSyncInventory(host.db);
    const keys = before.map((entry) => ({ globalId: entry.globalId, objectType: entry.objectType }));
    const entries = await Promise.all(keys.map((key) => readFramedSyncInventoryEntry(host.db, key)));
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
      await migrateVerifiedBodyInventory(tx);
      await tx.run('DROP TABLE content_blob_data');
    });
    expect(await readFramedSyncInventory(host.db, 'chunked')).toEqual(before);
    expect(await Promise.all(keys.map((key) => readFramedSyncInventoryEntry(host.db, key, 'chunked')))).toEqual(entries);
    expect(before.find((entry) => entry.globalId === 'readable')!.resourceHashes).toHaveLength(1);
    expect(before.find((entry) => entry.globalId === 'unavailable')!.resourceHashes).toEqual([]);
    host.sqlite.prepare('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, 16, 0)').run(missingHash);
    expect((await readFramedSyncInventoryEntry(host.db, { globalId: 'unavailable', objectType: 'external_document' }, 'chunked'))!.resourceHashes).toEqual([]);
    await expect(readFramedSyncInventory(host.db)).rejects.toThrow('no such table: content_blob_data');
  } finally { host.sqlite.close(); }
});

it('preserves discovery identities and current resources across the stable-body schema transition and later writes', async () => {
  const old = textDevice();
  const stable = textDevice();
  try {
    const base = textBranch('base', 'Original', undefined, timestamp);
    const peer = textBranch('peer', 'Concurrent', undefined, timestamp);
    const entry = alternativeForBody(peer, timestamp);
    base.snapshot.text_alternatives = [entry];
    base.alternative_bodies = [{ hash: entry.body_blob_hash, text: peer.body_text! }];
    const resource = 'b'.repeat(64);
    base.snapshot.resource_references = JSON.stringify([{ storage_key: `${resource}.png`, role: 'image', original_name: null }]);
    for (const host of [old, stable]) {
      await recordFramedSyncResourceAvailability(host.db, [resource], true);
      await applySyncNodesWithDbPort(host.db, [base]);
    }
    const before = inventory(old);
    await stable.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateVerifiedBodyInventory(tx);
    });
    expect(inventory(stable)).toEqual(before);
    const next = textBranch('next', '\ufeff---\r\nkey: value\r\n---\r\n' + 'x'.repeat(3 * 1024 * 1024), base,
      '2026-10-07T01:00:00.000Z');
    next.snapshot.resource_references = base.snapshot.resource_references;
    await applySyncNodesWithDbPort(old.db, [next]);
    await writeVerifiedCurrentNode(stable.db, await referencedNode(stable.db, next), { invalidatedAt: timestamp });
    expect(inventory(stable)).toEqual(inventory(old));
    expect(stable.sqlite.prepare('SELECT count(*) FROM node_sync_versions WHERE body_text IS NOT NULL').pluck().get()).toBe(0);
    expect(stable.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    expect(stable.sqlite.prepare("SELECT available FROM framed_sync_resource_availability WHERE hash = ?").pluck().get(entry.body_blob_hash)).toBe(1);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it.each(['', '\ufeffDeleted original 中文😀\r\n' + 'x'.repeat(3 * 1024 * 1024)])(
  'keeps original deletion-body discovery and the empty transport summary after retirement', async (body) => {
    const old = textDevice();
    const stable = textDevice();
    try {
      const record = textBranch('deletion', body, undefined, timestamp);
      record.is_tombstone = true;
      record.snapshot.deleted_at = timestamp;
      record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: body });
      for (const host of [old, stable]) await applySyncNodesWithDbPort(host.db, [record]);
      await stable.db.transaction(async (tx) => {
        await migrateBodyContentStorage(tx);
        await migrateVerifiedBodyInventory(tx);
      });
      expect(inventory(stable)).toEqual(inventory(old));
      old.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
        snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', NULL) WHERE version_id = 'deletion'`).run();
      stable.sqlite.prepare(`UPDATE node_sync_versions SET body_state = 'retired', body_blob_hash = NULL,
        snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', NULL) WHERE version_id = 'deletion'`).run();
      expect(inventory(stable)).toEqual(inventory(old));
      const summary = stable.sqlite.prepare("SELECT body_hash FROM framed_sync_version_summary WHERE version_id = 'deletion'").get();
      expect(summary).toEqual({ body_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
    } finally { old.sqlite.close(); stable.sqlite.close(); }
  }
);

it('keeps empty readable bodies distinct from retired versions in summaries and discovery', async () => {
  const host = textDevice();
  try {
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateVerifiedBodyInventory(tx);
    });
    const record = await referencedNode(host.db, textBranch('empty', '', undefined, timestamp));
    await writeVerifiedCurrentNode(host.db, record, { invalidatedAt: timestamp });
    const retired = { ...record, metadata: { ...record.metadata, version_id: 'retired' }, body: { kind: 'retired' } } as const;
    await upsertVerifiedSyncNodeVersion(host.db, retired);
    expect(host.sqlite.prepare('SELECT version_id, body_hash FROM framed_sync_version_summary ORDER BY version_id').all())
      .toEqual([{ version_id: 'empty', body_hash: record.body.kind === 'readable' ? record.body.ref.hash : null },
        { version_id: 'retired', body_hash: null }]);
    const current = inventory(host)[0] as { frontier_json: string; resources_json: string };
    expect(JSON.parse(current.frontier_json)).toEqual(['empty', 'retired']);
    expect(JSON.parse(current.resources_json)).toHaveLength(1);
  } finally { host.sqlite.close(); }
});

it('rolls back body migration and trigger replacement when rebuilding inventory fails', async () => {
  const host = textDevice();
  try {
    const original = textBranch('version', 'Preserved original', undefined, timestamp);
    await applySyncNodesWithDbPort(host.db, [original]);
    const before = inventory(host);
    const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
    const sources = host.sqlite.prepare('SELECT * FROM content_blob_data').all();
    const triggers = host.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
    await expect(host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await tx.run(`CREATE TRIGGER fail_inventory_rebuild BEFORE INSERT ON framed_sync_version_summary
        BEGIN SELECT RAISE(ABORT, 'inventory_unavailable'); END`);
      await migrateVerifiedBodyInventory(tx);
    })).rejects.toThrow('inventory_unavailable');
    expect(inventory(host)).toEqual(before);
    expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
    expect(host.sqlite.prepare('SELECT * FROM content_blob_data').all()).toEqual(sources);
    expect(host.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all()).toEqual(triggers);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_bodies'").get()).toBeUndefined();
  } finally { host.sqlite.close(); }
});
