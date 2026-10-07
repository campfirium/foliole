// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../database/framedSyncStagingSchema.js';
import { readFramedSyncPublication } from '../database/framedSyncStagingSerialization.js';
import { LATEST_NUMBERED_SCHEMA_MIGRATIONS } from '../database/numberedMigrationLatestRegistry.js';

import type { DbRow } from './dbPort.js';
import { canonicalContentId, canonicalManifestBytes, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { retireFramedSyncCompletedPublication } from './framedSyncCompletedPublication.js';
import { expireFramedSyncCompletions, FRAMED_SYNC_RECEIPT_RETENTION_MS,
  markFramedSyncCompletion } from './framedSyncCompletionRetention.js';
import { createFramedSyncOutboundReceiptStaging } from './framedSyncOutboundReceiptStaging.js';
import { publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';

let sqlite: Database.Database;
afterEach(() => sqlite?.close());

async function setup() {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const db = createBetterSqliteDbPort(sqlite);
  const context = { groupId: 'g', protocolVersion: 22 as const, senderDeviceId: 'A',
    senderLibraryEpoch: 'a', receiverDeviceId: 'B', receiverLibraryEpoch: 'b' };
  const manifest = { blobs: [], facts: [{ blobs: [], body: [
    { name: 'payload_json', value: { kind: 'string' as const, value: 'Only surviving original setting' } }
  ], kind: 1, objectType: 'setting',
    globalId: 's', factId: 'state', sharedStateHash: new Uint8Array(32) }] };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  await publishFramedSyncOutboundWithDbPort(db, { context, contentId, transferId, manifest,
    manifestHash: contentId });
  return { db, transferId, receipt: { transferId, contentId, appliedStateHash: new Uint8Array(32),
    receiverDeviceId: 'B', receiverLibraryEpoch: 'b' } };
}

it('expires only finished bookkeeping and never expires an unconfirmed owner', async () => {
  const { db, transferId, receipt } = await setup();
  await markFramedSyncCompletion(db, transferId, 0);
  const expired = FRAMED_SYNC_RECEIPT_RETENTION_MS + 1;
  expect(await expireFramedSyncCompletions(db, expired)).toBe(0);
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_holds').get()).toEqual({ count: 1 });
  const staging = createFramedSyncOutboundReceiptStaging(db);
  await staging.commitOutboundReceipt(receipt);
  await staging.releaseOutboundHolds(transferId);
  await retireFramedSyncCompletedPublication(db, transferId);
  expect(await expireFramedSyncCompletions(db, FRAMED_SYNC_RECEIPT_RETENTION_MS)).toBe(0);
  expect(await expireFramedSyncCompletions(db, expired)).toBe(1);
  expect(sqlite.prepare('SELECT * FROM framed_sync_receipts').all()).toEqual([]);
  expect(sqlite.prepare('SELECT * FROM framed_sync_outbound_publications').all()).toEqual([]);
});

it('accepts a changed result snapshot for the same input but rejects another receiver', async () => {
  const { db, receipt } = await setup();
  const staging = createFramedSyncOutboundReceiptStaging(db);
  await staging.commitOutboundReceipt(receipt);
  await expect(staging.commitOutboundReceipt({ ...receipt, appliedStateHash: new Uint8Array(32).fill(1) }))
    .resolves.toBe('committed');
  await expect(staging.commitOutboundReceipt({ ...receipt, receiverLibraryEpoch: 'other' }))
    .rejects.toThrow('outbound_receipt_mismatch');
});

it('migrates a pending unique input without losing its payload or hold', async () => {
  const { db, transferId } = await setup();
  const [row] = await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications');
  const input = readFramedSyncPublication(row!);
  sqlite.prepare('UPDATE framed_sync_outbound_publications SET canonical_manifest = ?')
    .run(canonicalManifestBytes(input.manifest));
  sqlite.exec('DROP TABLE framed_sync_completion_windows');
  const migrate = LATEST_NUMBERED_SCHEMA_MIGRATIONS.find((value) => value.version === 148)!.migrate;
  sqlite.transaction(() => migrate(sqlite))();
  const [after] = await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications');
  expect(readFramedSyncPublication(after!).manifest).toEqual(input.manifest);
  expect(after!.canonical_manifest).toHaveLength(0);
  expect(readFramedSyncPublication(after!).inventoryDifference?.need.sharedState).toBe(true);
  expect(await expireFramedSyncCompletions(db, Date.now() + FRAMED_SYNC_RECEIPT_RETENTION_MS * 2)).toBe(0);
  expect(sqlite.prepare('SELECT transfer_id FROM framed_sync_outbound_holds').pluck().get())
    .toEqual(Buffer.from(transferId));
});

it('preserves both conflicting legacy input representations when conversion cannot be proven', async () => {
  const { db } = await setup();
  sqlite.prepare('UPDATE framed_sync_outbound_publications SET canonical_manifest = ?').run(Uint8Array.of(1));
  const before = await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications');
  const migrate = LATEST_NUMBERED_SCHEMA_MIGRATIONS.find((value) => value.version === 148)!.migrate;
  expect(sqlite.transaction(() => migrate(sqlite))).toThrow('framed_sync_migration_unique_input_mismatch');
  expect(await db.query<DbRow>('SELECT * FROM framed_sync_outbound_publications')).toEqual(before);
  expect(sqlite.prepare('SELECT COUNT(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
});
