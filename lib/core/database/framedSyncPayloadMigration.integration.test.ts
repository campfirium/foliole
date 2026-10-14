// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import type { DbRow } from '../sync/dbPort.js';
import { canonicalContentId, canonicalManifestBytes, canonicalTransferIdSync,
  type CanonicalManifest } from '../sync/framedSyncCanonicalManifest.js';
import { decodePublicationInventory } from '../sync/framedSyncPublicationInventory.js';

import { FRAMED_SYNC_STAGING_SCHEMA } from './framedSyncStagingSchema.js';
import { decodeFramedSyncManifest, encodeFramedSyncManifest, readFramedSyncPublication } from './framedSyncStagingSerialization.js';
import { LATEST_NUMBERED_SCHEMA_MIGRATIONS } from './numberedMigrationLatestRegistry.js';

let sqlite: Database.Database;
afterEach(() => sqlite?.close());

async function setup(protocolVersion = 24) {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const context = { groupId: 'g', protocolVersion, senderDeviceId: 'A',
    senderLibraryEpoch: 'a', receiverDeviceId: 'B', receiverLibraryEpoch: 'b' };
  const manifest = { blobs: [], facts: [{ blobs: [], body: [
    { name: 'payload_json', value: { kind: 'string', value: 'Only surviving original setting' } }
  ], kind: 1, objectType: 'setting', globalId: 's', factId: 'state',
  sharedStateHash: new Uint8Array(32) }] } satisfies CanonicalManifest;
  const contentId = await canonicalContentId(manifest);
  const transferId = canonicalTransferIdSync(context, contentId);
  sqlite.prepare(`INSERT INTO framed_sync_outbound_publications
    (transfer_id, content_id, manifest_hash, canonical_manifest, manifest_json, protocol_version,
      group_id, sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch,
      fact_count, blob_count, total_blob_bytes, state)
    VALUES (?, ?, ?, ?, ?, ?, 'g', 'A', 'a', 'B', 'b', 1, 0, 0, 'published')`)
    .run(transferId, contentId, contentId, canonicalManifestBytes(manifest), encodeFramedSyncManifest(manifest), protocolVersion);
  sqlite.prepare('INSERT INTO framed_sync_outbound_fact_refs VALUES (?, 1, ?, ?, ?)')
    .run(transferId, 'setting', 's', 'state');
  sqlite.prepare('INSERT INTO framed_sync_outbound_holds VALUES (?, ?)').run(transferId, 'B');
  return { db: createBetterSqliteDbPort(sqlite), manifest, transferId };
}

function migrate() {
  const migration = LATEST_NUMBERED_SCHEMA_MIGRATIONS.find(value => value.version === 148);
  if (!migration) throw new Error('fixture_migration_148_missing');
  sqlite.transaction(() => migration.migrate(sqlite))();
}

it('migrates a pending unique input without losing its payload or hold', async () => {
  const { db, manifest, transferId } = await setup();
  sqlite.exec('DROP TABLE framed_sync_completion_windows');
  migrate();
  const [after] = await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications');
  expect(readFramedSyncPublication(after!).manifest).toEqual(manifest);
  expect(after!.canonical_manifest).toHaveLength(0);
  expect(readFramedSyncPublication(after!).inventoryDifference?.need.sharedState).toBe(true);
  expect(after!.state).toBe('published');
  expect(sqlite.prepare('SELECT transfer_id, member_id FROM framed_sync_outbound_holds').all())
    .toEqual([{ transfer_id: Buffer.from(transferId), member_id: 'B' }]);
});

it('preserves both conflicting legacy input representations when conversion cannot be proven', async () => {
  const { db, transferId } = await setup();
  sqlite.prepare('UPDATE framed_sync_outbound_publications SET canonical_manifest = ?').run(Uint8Array.of(1));
  const before = await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications');
  expect(migrate).toThrow('framed_sync_migration_unique_input_mismatch');
  expect(await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications')).toEqual(before);
  expect(sqlite.prepare('SELECT transfer_id, member_id FROM framed_sync_outbound_holds').all())
    .toEqual([{ transfer_id: Buffer.from(transferId), member_id: 'B' }]);
});

it.each([22, 23])('upgrades protocol %s publication payloads from schema 147', async protocolVersion => {
  const { db, manifest, transferId } = await setup(protocolVersion);
  sqlite.pragma('user_version = 147');
  migrate();
  const [after] = await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications');
  expect(after!.protocol_version).toBe(protocolVersion);
  expect(decodeFramedSyncManifest(String(after!.manifest_json))).toEqual(manifest);
  expect(decodePublicationInventory(String(after!.manifest_json))?.need.sharedState).toBe(true);
  expect(after!.canonical_manifest).toHaveLength(0);
  expect(sqlite.prepare('SELECT transfer_id, member_id FROM framed_sync_outbound_holds').all())
    .toEqual([{ transfer_id: Buffer.from(transferId), member_id: 'B' }]);
});
