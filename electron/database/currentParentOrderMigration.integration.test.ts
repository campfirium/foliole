// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { decodeFramedSyncManifest, encodeFramedSyncManifest } from '../../lib/core/database/framedSyncStagingSerialization.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { currentParentOrderHash, currentParentOrderPayload, type ParentOrderSource } from '../../lib/core/sync/currentParentOrder.js';
import { applyCurrentParentOrderRecord, loadCurrentParentOrderSources, saveLocalCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore.js';
import { canonicalContentId, canonicalTransferIdSync, type CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { stageFramedSyncFrozenBody } from '../../lib/core/sync/framedSyncFrozenBody.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { bindParentOrderWriterWithDbPort } from '../../lib/core/sync/parentOrderWriter.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch } from './topicTextState.testSupport.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const projection = projectFramedSyncNodeRecord(textBranch('original-version', 'Original unpublished body'));
const body = projection.bodyBlob;
const blob = projection.manifest.blobs[0]!;
const nodeFact = projection.manifest.facts[0]!;
const orderFact: CanonicalFact = { kind: 1, objectType: 'parent_child_order', globalId: 'parent',
  factId: 'old-order', sharedStateHash: new Uint8Array(32), blobs: [], body: [] };

function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  db.exec(`DROP TRIGGER trg_parent_order_node_insert;
    DROP TRIGGER trg_parent_order_node_update;
    DROP TRIGGER trg_parent_order_node_delete;
    DROP TABLE parent_order_sources; DROP TABLE parent_order_writer;
    DROP TABLE parent_order_projection_pending;
    ALTER TABLE framed_sync_outbound_publications DROP COLUMN retirement_reason;
    CREATE TABLE parent_order_versions (version_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL,
      kind TEXT NOT NULL, child_ids_json TEXT NOT NULL, parent_version_ids_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE parent_order_heads (parent_id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES parent_order_versions(version_id));
    PRAGMA user_version = 151;`);
  db.pragma('foreign_keys = ON');
  db.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('parent', 'folder', 'Parent', '', 'now', 'now');
    INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('a', 'parent', 'topic', 'A', 'Original node body', 'now', 'now');
    INSERT INTO parent_child_order VALUES ('parent', '["a"]', '2099-01-01');`);
  const port = createBetterSqliteDbPort(db);
  return { db, port };
}

async function publish(host: ReturnType<typeof fixture>, facts: CanonicalFact[]) {
  const manifest = { facts, blobs: facts.includes(nodeFact) ? [blob] : [] };
  const context = { protocolVersion: 22, groupId: 'group',
    senderDeviceId: 'a', senderLibraryEpoch: 'a-epoch', receiverDeviceId: 'b', receiverLibraryEpoch: 'b-epoch' };
  const contentId = await canonicalContentId(manifest);
  const transferId = canonicalTransferIdSync(context, contentId);
  await host.port.transaction(async (tx) => {
    if (manifest.blobs.length) await stageFramedSyncFrozenBody(tx, blob, body);
    await tx.run(`INSERT INTO framed_sync_outbound_publications
      (transfer_id, content_id, manifest_hash, canonical_manifest, manifest_json, protocol_version,
        group_id, sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch,
        fact_count, blob_count, total_blob_bytes, state)
      VALUES (?, ?, ?, ?, ?, 22, 'group', 'a', 'a-epoch', 'b', 'b-epoch', ?, ?, ?, 'published')`,
    [transferId, contentId, contentId, new Uint8Array(), encodeFramedSyncManifest(manifest),
      facts.length, manifest.blobs.length, manifest.blobs.reduce((sum, value) => sum + value.byteLength, 0n)]);
    for (const fact of facts) await tx.run('INSERT INTO framed_sync_outbound_fact_refs VALUES (?, ?, ?, ?, ?)',
      [transferId, fact.kind, fact.objectType, fact.globalId, fact.factId]);
    for (const value of manifest.blobs) await tx.run('INSERT INTO framed_sync_outbound_blob_refs VALUES (?, ?, ?, ?, ?)',
      [transferId, value.sha256, value.byteLength, value.role, value.required ? 1 : 0]);
    await tx.run('INSERT INTO framed_sync_outbound_holds VALUES (?, ?)', [transferId, 'b']);
  });
  return transferId;
}

function upgrade(host: ReturnType<typeof fixture>, kind: 'desktop' | 'companion') {
  if (kind === 'desktop') return Promise.resolve().then(() => initializeDatabaseSchema(host.db));
  return host.port.transaction(tx => migrateCompanionDatabase(tx, 80, 81));
}

it.each(['desktop', 'companion'] as const)('transfers mixed original facts and body ownership atomically on %s', async (kind) => {
  const host = fixture();
  const oldId = await publish(host, [nodeFact, orderFact]);
  await upgrade(host, kind);
  expect(host.db.prepare('SELECT state, retirement_reason FROM framed_sync_outbound_publications WHERE transfer_id = ?')
    .get(oldId)).toEqual({ state: 'terminated', retirement_reason: 'parent-order-format-upgrade' });
  const next = host.db.prepare<[], { manifest_json: string }>(
    "SELECT manifest_json FROM framed_sync_outbound_publications WHERE state = 'published'").all();
  expect(next).toHaveLength(2);
  expect(next.flatMap((row) => decodeFramedSyncManifest(row.manifest_json).facts)).toContainEqual(nodeFact);
  expect(host.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(2);
  expect(host.db.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
  expect(host.db.prepare('SELECT data FROM framed_sync_available_blobs').pluck().get()).toEqual(Buffer.from(body));
  expect(host.db.prepare('SELECT counter, child_ids_json FROM parent_order_sources').all())
    .toEqual([{ counter: 0, child_ids_json: '["a"]' }]);
  expect(host.db.prepare("SELECT name FROM sqlite_master WHERE name = 'parent_order_versions'").get()).toBeUndefined();
  expect(host.db.prepare("SELECT content FROM nodes WHERE id = 'a'").pluck().get()).toBe('Original node body');
});

it('retires pure order publication without inventing a delivery receipt', async () => {
  const host = fixture();
  await publish(host, [orderFact]);
  await upgrade(host, 'desktop');
  expect(host.db.prepare('SELECT state FROM framed_sync_outbound_publications').pluck().all()).toEqual(['terminated']);
  expect(host.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0);
  expect(host.db.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
});

it.each(['desktop', 'companion'] as const)('rolls back owner transfer and schema after an injected %s failure', async (kind) => {
  const host = fixture();
  const oldId = await publish(host, [nodeFact, orderFact]);
  host.db.exec(`CREATE TRIGGER fail_order_retirement BEFORE UPDATE OF state ON framed_sync_outbound_publications
    WHEN NEW.state = 'terminated' BEGIN SELECT RAISE(ABORT, 'injected-retirement-failure'); END`);
  await expect(upgrade(host, kind)).rejects.toThrow('injected-retirement-failure');
  expect(host.db.prepare('SELECT transfer_id, state FROM framed_sync_outbound_publications').all())
    .toEqual([{ transfer_id: Buffer.from(oldId), state: 'published' }]);
  expect(host.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
  expect(host.db.prepare('SELECT data FROM framed_sync_available_blobs').pluck().get()).toEqual(Buffer.from(body));
  expect(host.db.prepare("SELECT name FROM sqlite_master WHERE name = 'parent_order_sources'").get()).toBeUndefined();
});

it('rejects missing frozen body before releasing its original owner', async () => {
  const host = fixture();
  await publish(host, [nodeFact, orderFact]);
  host.db.exec('DELETE FROM framed_sync_available_blobs');
  await expect(upgrade(host, 'desktop')).rejects.toThrow('frozen_body_missing');
  expect(host.db.prepare('SELECT state FROM framed_sync_outbound_publications').pluck().all()).toEqual(['published']);
  expect(host.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
});

it('keeps a real edit above a later upgrade seed without discarding the old device new member', async () => {
  const early = fixture(); const late = fixture();
  for (const host of [early, late]) host.db.exec(`INSERT INTO nodes
    (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('b', 'parent', 'topic', 'B', 'B body', 'now', 'now');
    UPDATE parent_child_order SET child_ids_json = '["a","b"]' WHERE parent_id = 'parent'`);
  await upgrade(early, 'desktop');
  await bindParentOrderWriterWithDbPort(early.port, { deviceAnchor: 'early', libraryPath: '/early' });
  await saveLocalCurrentParentOrderWithDbPort(early.port, {
    parentId: 'parent', childIds: ['b', 'a'], now: '2026-10-11', hostName: 'early'
  });
  late.db.exec(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('c', 'parent', 'topic', 'C', 'Offline new body', 'now', 'now');
    UPDATE parent_child_order SET child_ids_json = '["a","c","b"]' WHERE parent_id = 'parent'`);
  await upgrade(late, 'desktop');
  const seed = await loadCurrentParentOrderSources(late.port, 'parent');
  expect(seed.map(source => source.counter)).toEqual([0]);
  await upgrade(late, 'desktop');
  expect(await loadCurrentParentOrderSources(late.port, 'parent')).toEqual(seed);
  const deliver = (host: typeof early, sources: ParentOrderSource[]) => applyCurrentParentOrderRecord(host.port, {
    object_type: 'parent_child_order', object_id: 'parent', deleted_at: null, updated_at: '2099-01-01',
    payload_json: JSON.stringify(currentParentOrderPayload('parent', sources)),
    content_hash: currentParentOrderHash('parent', sources)
  });
  await deliver(late, await loadCurrentParentOrderSources(early.port, 'parent'));
  await deliver(early, seed);
  expect(late.db.prepare("SELECT child_ids_json FROM parent_child_order WHERE parent_id = 'parent'").pluck().get())
    .toBe('["b","a","c"]');
  expect(early.db.prepare("SELECT child_ids_json FROM parent_child_order WHERE parent_id = 'parent'").pluck().get())
    .toBe('["b","a"]');
  expect(late.db.prepare("SELECT content FROM nodes WHERE id = 'c'").pluck().get()).toBe('Offline new body');
  expect(await loadCurrentParentOrderSources(early.port, 'parent'))
    .toEqual(await loadCurrentParentOrderSources(late.port, 'parent'));
});
