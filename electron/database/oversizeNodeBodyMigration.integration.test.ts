// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { bodyPartNodeId } from '../../lib/core/database/bodyPartitionIdentity.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { projectNodeInlineContent } from '../../lib/core/database/nodeInlineProjection.js';
import { recordLocalParentOrderVersion } from '../../lib/core/database/parentOrderVersionMutations.js';
import { readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { TEXT_BODY_MAX_BYTES } from '../../lib/core/nodes/textBodyBudget.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: Array<Pick<ReturnType<typeof textDevice>, 'sqlite' | 'db'>> = [];
afterEach(() => devices.splice(0).forEach((device) => device.sqlite.close()));
const NOW = '2026-10-08T00:00:00.000Z';
const BODY = `---\ntitle: Old\n---\n${'雪😀\r\n'.repeat(140000)}tail\n`;

function companionDevice() {
  const sqlite = new Database(':memory:');
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  return { sqlite, db: createBetterSqliteDbPort(sqlite) };
}

async function fixture(companion: boolean, inline = false) {
  const host = companion ? companionDevice() : textDevice();
  devices.push(host);
  await applyConvergentSyncNodesWithDbPort(host.db, [textBranch('original-head', 'Original version', undefined, NOW)]);
  const driver = createBetterSqlite3Driver(host.sqlite);
  const hash = upsertTextBodyBlob(driver, BODY, NOW);
  host.sqlite.prepare(`UPDATE nodes SET content = ?, body_blob_hash = ?, resource_references = ?,
    image_sources = ? WHERE id = 'topic'`).run(inline ? BODY : projectNodeInlineContent(BODY), hash,
  '[{"storage_key":"original.pdf","role":"reference"}]', '{"image":"original.png"}');
  host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = ?, snapshot_json =
    json_set(snapshot_json, '$.content', ?, '$.body_blob_hash', ?) WHERE version_id = 'original-head'`)
    .run(BODY, BODY, hash);
  host.sqlite.exec(`INSERT INTO node_version_local_holds VALUES ('editor', 'topic', 'original-head', '${NOW}');
    INSERT INTO nodes (id,parent_id,kind,title,content,anchor_link,created_at,updated_at,sync_dirty)
    VALUES ('anchored','topic','topic','Highlight','Preserved highlight',
      '{"id":"anchor","kind":"highlight","locator":{"from":600010,"to":600030,"originalText":"preserved"}}',
      '${NOW}','${NOW}',1);
    INSERT INTO parent_child_order VALUES ('topic','["anchored"]','${NOW}');
    INSERT INTO framed_sync_outbound_publications VALUES
      (zeroblob(16),zeroblob(32),zeroblob(32),X'','{"facts":[{"factId":"original-head","body":[]}]}',
        1,'group','sender','epoch','receiver','epoch',1,0,0,'published');
    INSERT INTO framed_sync_outbound_fact_refs VALUES (zeroblob(16),2,'node','topic','original-head');
    INSERT INTO framed_sync_outbound_holds VALUES (zeroblob(16),'receiver');`);
  host.sqlite.prepare('INSERT INTO framed_sync_outbound_blob_refs VALUES (zeroblob(16), ?, ?, 1, 1)')
    .run(Buffer.from(hash, 'hex'), Buffer.byteLength(BODY));
  host.sqlite.prepare('UPDATE framed_sync_outbound_publications SET blob_count = 1, total_blob_bytes = ?')
    .run(Buffer.byteLength(BODY));
  recordLocalParentOrderVersion(driver, { parentId: 'topic', before: [], order: ['anchored'],
    createdAt: NOW, kind: 'membership' });
  host.sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  const original = {
    versions: host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all(),
    publications: host.sqlite.prepare('SELECT * FROM framed_sync_outbound_publications').all(),
    holds: host.sqlite.prepare('SELECT * FROM node_version_local_holds').all(),
    outboundHolds: host.sqlite.prepare('SELECT * FROM framed_sync_outbound_holds').all(),
    orders: host.sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all() as Array<{ version_id: string }>
  };
  return { ...host, driver, original, hash };
}

async function upgrade(host: Awaited<ReturnType<typeof fixture>>, companion: boolean) {
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 78, 79));
  else initializeDatabaseSchema(host.sqlite);
}

function assertPreserved(host: Awaited<ReturnType<typeof fixture>>) {
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(host.original.versions);
  expect(host.sqlite.prepare('SELECT * FROM framed_sync_outbound_publications').all()).toEqual(host.original.publications);
  expect(host.sqlite.prepare('SELECT * FROM node_version_local_holds').all()).toEqual(host.original.holds);
  expect(host.sqlite.prepare('SELECT * FROM framed_sync_outbound_holds').all()).toEqual(host.original.outboundHolds);
  for (const order of host.original.orders) {
    expect(host.sqlite.prepare('SELECT * FROM parent_order_versions WHERE version_id = ?').get(order.version_id)).toEqual(order);
  }
  expect(host.sqlite.prepare("SELECT current_version_id, content, sync_dirty FROM nodes WHERE id='topic'").get())
    .toEqual({ current_version_id: 'original-head', content: '', sync_dirty: 1 });
  expect(readPartitionedNodeBody(host.driver, 'topic')).toBe(BODY);
  expect(host.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').get(host.hash))
    .toEqual({ data: Buffer.from(BODY) });
  expect(host.sqlite.prepare('SELECT data FROM framed_sync_available_blobs WHERE sha256 = ?').get(Buffer.from(host.hash, 'hex')))
    .toEqual({ data: Buffer.from(BODY) });
  const parts = host.sqlite.prepare(`SELECT id, content, resource_references, image_sources, sync_dirty
    FROM nodes WHERE parent_id='topic' AND id != 'anchored' ORDER BY id`).all() as Array<{
      id: string; content: string; resource_references: string; image_sources: string; sync_dirty: number }>;
  expect(parts.length).toBeGreaterThan(1);
  parts.forEach((part, index) => {
    expect(part.id).toBe(bodyPartNodeId('topic', index));
    expect(Buffer.byteLength(part.content)).toBeLessThanOrEqual(TEXT_BODY_MAX_BYTES);
    expect(part.resource_references).toBe('[{"storage_key":"original.pdf","role":"reference"}]');
    expect(part.image_sources).toBe('{"image":"original.png"}');
    expect(part.sync_dirty).toBe(1);
  });
  const anchor = host.sqlite.prepare("SELECT parent_id, anchor_link FROM nodes WHERE id='anchored'").get() as {
    parent_id: string; anchor_link: string };
  const start = parts.slice(0, parts.findIndex((part) => part.id === anchor.parent_id))
    .reduce((length, part) => length + part.content.length, 0);
  expect(JSON.parse(anchor.anchor_link).locator).toEqual({ from: 600010 - start, to: 600030 - start, originalText: 'preserved' });
  const head = host.sqlite.prepare(`SELECT version.child_ids_json FROM parent_order_heads head
    JOIN parent_order_versions version ON version.version_id=head.version_id WHERE head.parent_id='topic'`).get() as {
      child_ids_json: string };
  expect(JSON.parse(head.child_ids_json)).toEqual(parts.map((part) => part.id));
}

it.each([false, true])('migrates oversized legacy blob bodies atomically without host initialization companion=%s', async (companion) => {
  const host = await fixture(companion);
  await upgrade(host, companion);
  assertPreserved(host);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 79 : DATABASE_SCHEMA_VERSION);
  const orders = host.sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all();
  const nodes = host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
  await upgrade(host, companion);
  expect(host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(nodes);
  expect(host.sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all()).toEqual(orders);
});

it.each([false, true])('also partitions an already inline oversized body companion=%s', async (companion) => {
  const host = await fixture(companion, true);
  await upgrade(host, companion);
  assertPreserved(host);
});

it.each([false, true])('rolls back all parts and schema version on failure, then retries companion=%s', async (companion) => {
  const host = await fixture(companion);
  const before = host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
  host.sqlite.exec(`CREATE TRIGGER reject_part BEFORE INSERT ON nodes WHEN NEW.id = '${bodyPartNodeId('topic', 1)}'
    BEGIN SELECT RAISE(ABORT,'part_failed'); END`);
  await expect(upgrade(host, companion)).rejects.toThrow('part_failed');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 78 : 149);
  expect(host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(before);
  expect(host.sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all()).toEqual(host.original.orders);
  expect(host.sqlite.prepare('SELECT * FROM framed_sync_available_blobs').all()).toEqual([]);
  host.sqlite.exec('DROP TRIGGER reject_part');
  await upgrade(host, companion);
  assertPreserved(host);
});

it.each([false, true])('rejects a conflicting existing part without changing original data companion=%s', async (companion) => {
  const host = await fixture(companion);
  host.sqlite.prepare(`INSERT INTO nodes (id,parent_id,kind,title,content,created_at,updated_at)
    VALUES (?,'topic','topic','Existing','Different original',?,?)`).run(bodyPartNodeId('topic', 0), NOW, NOW);
  const before = host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
  await expect(upgrade(host, companion)).rejects.toThrow('node_body_migration_partition_conflict');
  expect(host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(before);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 78 : 149);
});

it.each([false, true])('rejects malformed UTF-8 before changing current text companion=%s', async (companion) => {
  const host = await fixture(companion);
  host.sqlite.exec('DELETE FROM framed_sync_outbound_holds');
  const corrupt = Buffer.from(BODY);
  corrupt[100] = 0xff;
  host.sqlite.prepare('UPDATE content_blob_data SET data = ? WHERE hash = ?').run(corrupt, host.hash);
  const before = host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
  await expect(upgrade(host, companion)).rejects.toThrow();
  expect(host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(before);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 78 : 149);
});

it.each([false, true])('keeps deleted roots and every new body part deleted companion=%s', async (companion) => {
  const host = await fixture(companion);
  host.sqlite.prepare('UPDATE nodes SET deleted_at = ?').run(NOW);
  host.sqlite.prepare(`UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.deleted_at', ?)`)
    .run(NOW);
  host.sqlite.prepare(`INSERT INTO node_sync_tombstones SELECT object_id, version_id, parent_version_id,
    host_name, content_hash, snapshot_json, ?, created_at FROM node_sync_versions WHERE version_id='original-head'`)
    .run(NOW);
  const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const tombstones = host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all();
  await upgrade(host, companion);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual(tombstones);
  expect(host.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id='topic'").get()).toEqual({ deleted_at: NOW });
  expect(host.sqlite.prepare("SELECT id FROM nodes WHERE parent_id='topic' AND deleted_at IS NULL").all()).toEqual([]);
  const parts = host.sqlite.prepare("SELECT content, deleted_at FROM nodes WHERE id LIKE 'node-body-part-%' ORDER BY id")
    .all() as Array<{ content: string; deleted_at: string }>;
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.map((part) => part.content).join('')).toBe(BODY);
  for (const part of parts) expect(part.deleted_at).toBe(NOW);
});
