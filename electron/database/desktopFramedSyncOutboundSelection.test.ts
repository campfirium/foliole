// @vitest-environment node

import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import {
  compareFramedSyncInventories,
  type FramedSyncInventoryEntry
} from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { publishDesktopFramedSyncNodeOutbound } from './desktopFramedSyncOutboundSelection.js';

let sqlite: Database.Database;
let port: DbPort;

const hash = (value: string) => new Uint8Array(createHash('sha256').update(value).digest());
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

function snapshot(versionId: string, contentHash: string, body: string) {
  const time = '2026-10-05T01:00:00.000Z';
  return JSON.stringify({
    anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null,
    attachments: [], body_blob_hash: hex(hash(body)), content: body, created_at: time,
    deleted_at: null, desired_retention: null, enable_short_term: null,
    hide_title_heading: false, id: 'node-1', image_regions: null, image_sources: null,
    import_content_fingerprint: null, import_source_fingerprint: null, is_title_manual: false,
    kind: 'article', manual_child_order: null, opening_text: null, parent_id: null,
    position: null, priority: null, resource_references: '[]', reveal: null,
    sequential_reading_enabled: null, shelved_at: null, title: versionId,
    updated_at: time, virtual_filter: null, content_hash: contentHash
  });
}

function insertVersion(versionId: string, body: string, contentHash: string) {
  sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, 'node-1', NULL, 'host-a', '2026-10-05T01:00:00.000Z', ?, ?, ?)`)
    .run(versionId, contentHash, body, snapshot(versionId, contentHash, body));
}

function entry(versionId: string, body: string, contentHash: string): FramedSyncInventoryEntry {
  return {
    frontierFactIds: [versionId], globalId: 'node-1', objectType: 'node',
    requiredRelationIds: [], resourceHashes: [hash(body)], reviewFactIds: [],
    sharedStateHash: Uint8Array.from(Buffer.from(contentHash, 'hex'))
  };
}

async function readCurrent(tx: DbPort): Promise<FramedSyncInventoryEntry | null> {
  const [row] = await tx.query<{ body_text: string; content_hash: string; current_version_id: string }>(
    `SELECT version.body_text, version.content_hash, node.current_version_id
     FROM nodes node JOIN node_sync_versions version ON version.version_id = node.current_version_id
     WHERE node.id = 'node-1'`
  );
  return row ? entry(row.current_version_id, row.body_text, row.content_hash) : null;
}

function context(receiverDeviceId: string): FramedSyncContext {
  return {
    groupId: 'group-1', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId, receiverLibraryEpoch: `${receiverDeviceId}-epoch`,
    senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch'
  };
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL,
      parent_version_id TEXT, host_name TEXT NOT NULL, created_at TEXT NOT NULL,
      content_hash TEXT NOT NULL, body_text TEXT, snapshot_json TEXT NOT NULL);
    CREATE TABLE node_sync_version_parents (version_id TEXT NOT NULL, parent_version_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL, PRIMARY KEY (version_id, parent_version_id));
    CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY, version_id TEXT NOT NULL,
      parent_version_id TEXT, host_name TEXT NOT NULL, content_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, deleted_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE review_log (node_id TEXT NOT NULL, op_id TEXT NOT NULL);`);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  port = createBetterSqliteDbPort(sqlite);
});

afterEach(() => sqlite.close());

it('publishes a deleted Node as its tombstone version fact', async () => {
  const contentHash = '9'.repeat(64);
  const deleted = JSON.parse(snapshot('tombstone-1', contentHash, ''));
  deleted.deleted_at = '2026-10-05T02:00:00.000Z';
  sqlite.prepare(`INSERT INTO node_sync_tombstones VALUES
    ('node-1', 'tombstone-1', NULL, 'host-a', ?, ?, ?, '2026-10-05T02:00:00.000Z')`)
    .run(contentHash, JSON.stringify(deleted), '2026-10-05T02:00:00.000Z');
  const frozen = await readFramedSyncInventoryEntry(port, {
    globalId: 'node-1', objectType: 'node'
  });
  if (!frozen) throw new Error('tombstone_inventory_missing');
  const [difference] = compareFramedSyncInventories({ local: [frozen], remote: [] });
  if (!difference) throw new Error('difference_missing');

  const result = await publishDesktopFramedSyncNodeOutbound({
    context: context('receiver-a'), difference, port,
    readCurrentInventoryEntry: readFramedSyncInventoryEntry
  });

  expect(result.kind).toBe('published');
  if (result.kind !== 'published') return;
  const tombstone = result.publication.manifest.facts.find((fact) => fact.kind === 2);
  expect(tombstone?.factId).toBe('tombstone-1');
  expect(tombstone?.body.find((field) => field.name === 'is_tombstone')?.value)
    .toEqual({ kind: 'bool', value: true });
});

it('publishes the exact frozen node fact, blob reference, and receiver-scoped hold', async () => {
  const contentHash = '1'.repeat(64);
  insertVersion('version-1', 'original body', contentHash);
  sqlite.prepare("INSERT INTO nodes VALUES ('node-1', 'version-1')").run();
  const frozen = entry('version-1', 'original body', contentHash);
  const [difference] = compareFramedSyncInventories({ local: [frozen], remote: [] });
  if (!difference) throw new Error('difference_missing');

  const result = await publishDesktopFramedSyncNodeOutbound({
    context: context('receiver-a'), difference, port,
    readCurrentInventoryEntry: (tx) => readCurrent(tx)
  });

  expect(result.kind).toBe('published');
  if (result.kind !== 'published') throw new Error('publication_missing');
  expect(result.publication.manifest.facts.map((fact) => fact.factId)).toEqual(['version-1']);
  expect(result.publication.manifest.blobs.map((blob) => hex(blob.sha256))).toEqual([hex(hash('original body'))]);
  expect(sqlite.prepare('SELECT fact_id FROM framed_sync_outbound_fact_refs').all())
    .toEqual([{ fact_id: 'version-1' }]);
  expect(sqlite.prepare('SELECT member_id FROM framed_sync_outbound_holds').all())
    .toEqual([{ member_id: 'receiver-a' }]);
  const replay = await publishDesktopFramedSyncNodeOutbound({
    context: context('receiver-a'), difference, port,
    readCurrentInventoryEntry: (tx) => readCurrent(tx)
  });
  expect(replay.kind === 'published' ? replay.stagingResult : replay.kind).toBe('identical');
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_publications').get())
    .toEqual({ count: 1 });
});

it('returns deferred and writes no old transfer when SQLite source changed before selection', async () => {
  const firstHash = '2'.repeat(64);
  insertVersion('version-1', 'first body', firstHash);
  sqlite.prepare("INSERT INTO nodes VALUES ('node-1', 'version-1')").run();
  const frozen = entry('version-1', 'first body', firstHash);
  const [difference] = compareFramedSyncInventories({ local: [frozen], remote: [] });
  if (!difference) throw new Error('difference_missing');
  insertVersion('version-2', 'edited body', '3'.repeat(64));
  sqlite.prepare("UPDATE nodes SET current_version_id = 'version-2' WHERE id = 'node-1'").run();

  const result = await publishDesktopFramedSyncNodeOutbound({
    context: context('receiver-b'), difference, port,
    readCurrentInventoryEntry: (tx) => readCurrent(tx)
  });

  expect(result).toEqual({
    deferredObjects: [{ globalId: 'node-1', objectType: 'node' }], kind: 'deferred'
  });
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_publications').get())
    .toEqual({ count: 0 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_holds').get())
    .toEqual({ count: 0 });
});

it('uses a distinct immutable transfer and hold for each receiver', async () => {
  const contentHash = '4'.repeat(64);
  insertVersion('version-1', 'shared body', contentHash);
  sqlite.prepare("INSERT INTO nodes VALUES ('node-1', 'version-1')").run();
  const frozen = entry('version-1', 'shared body', contentHash);
  const [difference] = compareFramedSyncInventories({ local: [frozen], remote: [] });
  if (!difference) throw new Error('difference_missing');
  const publish = (receiver: string) => publishDesktopFramedSyncNodeOutbound({
    context: context(receiver), difference, port,
    readCurrentInventoryEntry: (tx: DbPort) => readCurrent(tx)
  });

  const first = await publish('receiver-a');
  const second = await publish('receiver-b');
  expect(first.kind).toBe('published');
  expect(second.kind).toBe('published');
  if (first.kind !== 'published' || second.kind !== 'published') throw new Error('publication_missing');
  expect(hex(first.publication.transferId)).not.toBe(hex(second.publication.transferId));
  expect(sqlite.prepare('SELECT member_id FROM framed_sync_outbound_holds ORDER BY member_id').all())
    .toEqual([{ member_id: 'receiver-a' }, { member_id: 'receiver-b' }]);
});
