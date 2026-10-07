// @vitest-environment node
import { expect, it } from 'vitest';

import { availableBlobDatabase, observeAvailableReads } from '../../../electron/database/framedSyncAvailableBlobMigration.testSupport.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import { migrateFramedSyncAvailableBlobs } from './framedSyncAvailableBlobMigration.js';
import { type AvailableBlobScope } from './framedSyncAvailableBlobScope.js';
import { verifyAvailableBlobChunks } from './framedSyncAvailableBlobVerification.js';

it.each([new Uint8Array(), new TextEncoder().encode('\ufeff中😀\0文'.repeat(350000)),
  Uint8Array.from({ length: 3 * 1024 * 1024 + 17 }, (_, index) => index % 256)])(
  'preserves exact binary bytes and shared pins while replacing the continuous source', async (data) => {
    const host = availableBlobDatabase();
    try {
      const descriptor = host.insert(data);
      await host.pin(descriptor, 1);
      await host.pin(descriptor, 2, 5);
      host.sqlite.prepare('UPDATE framed_sync_blob_pins SET required = 0 WHERE transfer_id = ?').run(new Uint8Array(32).fill(2));
      const before = host.sqlite.prepare('SELECT * FROM framed_sync_blob_pins ORDER BY transfer_id').all();
      const result = await host.db.transaction(async (tx) => {
        const reads = observeAvailableReads(tx);
        expect(await migrateFramedSyncAvailableBlobs(reads.port, 'desktop')).toEqual({ migrated: 1 });
        expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
        expect(reads.statements.every((sql) => !/SELECT\s+(?:\*|data\b).*available_blobs/isu.test(sql))).toBe(true);
      });
      expect(result).toBeUndefined();
      const foreignKeys = host.sqlite.prepare<[], { table: string }>('PRAGMA foreign_key_list(framed_sync_blob_pins)').all();
      expect(foreignKeys.map((row) => row.table).sort()).toEqual(['framed_sync_available_blobs', 'framed_sync_inbound_transfers']);
      expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%continuous_upgrade'").all()).toEqual([]);
      expect(host.sqlite.prepare<[], { name: string }>('PRAGMA table_info(framed_sync_available_blobs)').all().map((row) => row.name))
        .toEqual(['sha256', 'byte_length']);
      expect(host.sqlite.prepare('SELECT * FROM framed_sync_blob_pins ORDER BY transfer_id').all()).toEqual(before);
      await verifyAvailableBlobChunks(host.db, 'desktop', descriptor);
      const chunks = host.sqlite.prepare<[], { byte_offset: number; data: Buffer }>(
        'SELECT byte_offset, data FROM framed_sync_available_blob_chunks ORDER BY byte_offset').all();
      expect(chunks).toHaveLength(Math.ceil(data.length / BODY_CONTENT_CHUNK_BYTES));
      for (const chunk of chunks) expect(chunk.data).toEqual(Buffer.from(data.slice(chunk.byte_offset, chunk.byte_offset + BODY_CONTENT_CHUNK_BYTES)));
      host.sqlite.prepare('DELETE FROM framed_sync_blob_pins WHERE transfer_id = ?').run(new Uint8Array(32).fill(1));
      expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blob_chunks').pluck().get()).toBe(chunks.length);
      expect(() => host.sqlite.prepare('DELETE FROM framed_sync_available_blobs').run()).toThrow('FOREIGN KEY');
      host.sqlite.prepare('DELETE FROM framed_sync_blob_pins').run();
      host.sqlite.prepare('DELETE FROM framed_sync_available_blobs').run();
      expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blob_chunks').pluck().get()).toBe(0);
    } finally { host.sqlite.close(); }
  });

it.each(['length', 'hash', 'type'] as const)('rolls back the whole migration for invalid source %s', async (kind) => {
  const host = availableBlobDatabase();
  try {
    const first = host.insert(Buffer.from('Original one'));
    const second = host.insert(Buffer.from('Original two'));
    await host.pin(first, 1);
    await host.pin(second, 2);
    if (kind === 'length') host.sqlite.prepare('UPDATE framed_sync_available_blobs SET byte_length = byte_length + 1 WHERE sha256 = ?').run(second.sha256);
    if (kind === 'hash') host.sqlite.prepare('UPDATE framed_sync_available_blobs SET data = ? WHERE sha256 = ?').run(Buffer.from('Corrupted!!!'), second.sha256);
    if (kind === 'type') host.sqlite.prepare('UPDATE framed_sync_available_blobs SET data = ? WHERE sha256 = ?').run('Original two', second.sha256);
    const before = host.sqlite.prepare('SELECT * FROM framed_sync_available_blobs ORDER BY rowid').all();
    const pins = host.sqlite.prepare('SELECT * FROM framed_sync_blob_pins ORDER BY transfer_id').all();
    const keys = host.sqlite.prepare('PRAGMA foreign_key_list(framed_sync_blob_pins)').all();
    await expect(host.db.transaction((tx) => migrateFramedSyncAvailableBlobs(tx, 'desktop')))
      .rejects.toThrow(kind === 'hash' ? 'blob_hash_mismatch' : 'blob_available_identity_conflict');
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_available_blobs ORDER BY rowid').all()).toEqual(before);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_available_blob_chunks'").get()).toBeUndefined();
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_blob_pins ORDER BY transfer_id').all()).toEqual(pins);
    expect(host.sqlite.prepare('PRAGMA foreign_key_list(framed_sync_blob_pins)').all()).toEqual(keys);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%continuous_upgrade'").all()).toEqual([]);
  } finally { host.sqlite.close(); }
});

it('rolls back every copied block and original BLOB when a later block insert rejects', async () => {
  const host = availableBlobDatabase();
  try {
    const descriptor = host.insert(new TextEncoder().encode('中😀'.repeat(500000)));
    await host.pin(descriptor, 1);

    const before = host.sqlite.prepare('SELECT * FROM framed_sync_available_blobs').all();
    const pins = host.sqlite.prepare('SELECT * FROM framed_sync_blob_pins').all();
    const keys = host.sqlite.prepare('PRAGMA foreign_key_list(framed_sync_blob_pins)').all();
    await expect(host.db.transaction((tx) => migrateFramedSyncAvailableBlobs({ ...tx,
      async run(sql, params) {
        const result = await tx.run(sql, params);
        if (sql.startsWith('CREATE TABLE main.framed_sync_available_blob_chunks')) {
          await tx.run(`CREATE TRIGGER reject_later_block BEFORE INSERT ON framed_sync_available_blob_chunks
            WHEN NEW.byte_offset = ${BODY_CONTENT_CHUNK_BYTES} BEGIN SELECT RAISE(ABORT, 'block_insert_rejected'); END`);
        }
        return result;
      }
    }, 'desktop'))).rejects.toThrow('block_insert_rejected');
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_available_blobs').all()).toEqual(before);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_available_blob_chunks'").get()).toBeUndefined();
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_blob_pins').all()).toEqual(pins);
    expect(host.sqlite.prepare('PRAGMA foreign_key_list(framed_sync_blob_pins)').all()).toEqual(keys);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%continuous_upgrade'").all()).toEqual([]);
  } finally { host.sqlite.close(); }
});

it('rejects arbitrary scope before running any SQL', async () => {
  const host = availableBlobDatabase();
  try {
    const reads = observeAvailableReads(host.db);
    await expect(migrateFramedSyncAvailableBlobs(reads.port, 'constructor' as AvailableBlobScope))
      .rejects.toThrow('framed_sync_available_scope_invalid');
    expect(reads.statements).toEqual([]);
    expect(host.sqlite.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'framed_sync_available_blob_chunks'").pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});
