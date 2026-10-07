// @vitest-environment node
import { expect, it } from 'vitest';

import { BODY_CONTENT_CHUNK_BYTES } from '../../lib/core/database/bodyContentSchema.js';
import { migrateFramedSyncAvailableBlobs } from '../../lib/core/database/framedSyncAvailableBlobMigration.js';
import { verifyAvailableBlobChunks } from '../../lib/core/database/framedSyncAvailableBlobVerification.js';

import { observeAvailableReads } from './framedSyncAvailableBlobMigration.testSupport.js';
import { nativeAvailableDatabase, type NativeAvailableScope } from './framedSyncNativeAvailableMigration.testSupport.js';

const scopes: NativeAvailableScope[] = ['android', 'ios'];

it.each(scopes)('preserves %s attached binary source, shared pins and original foreign keys', async (scope) => {
  const host = nativeAvailableDatabase(scope);
  try {
    const data = Uint8Array.from({ length: 3 * 1024 * 1024 + 17 }, (_, index) => index % 256);
    const descriptor = host.insert(data);
    const empty = host.insert(new Uint8Array());
    host.pin(descriptor, 1, 1, 1);
    host.pin(descriptor, 2, 5, 0);
    const pins = host.rows(host.tables.pins);
    const keys = host.keys();
    await host.db.transaction(async (tx) => {
      const reads = observeAvailableReads(tx);
      expect(await migrateFramedSyncAvailableBlobs(reads.port, scope)).toEqual({ migrated: 2 });
      expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
      expect(reads.statements.every((sql) => !/SELECT\s+(?:\*|data\b).*available_blobs/isu.test(sql))).toBe(true);
    });
    expect(host.rows(host.tables.pins)).toEqual(pins);
    expect(host.keys()).toEqual(keys);
    expect(host.temporaryTables()).toEqual([]);
    await verifyAvailableBlobChunks(host.db, scope, descriptor);
    await verifyAvailableBlobChunks(host.db, scope, empty);
    const chunks = host.sqlite.prepare<[], { byte_offset: number; data: Buffer }>(
      `SELECT byte_offset, data FROM ${host.tables.chunks} ORDER BY byte_offset`).all();
    expect(chunks).toHaveLength(Math.ceil(data.length / BODY_CONTENT_CHUNK_BYTES));
    for (const chunk of chunks) expect(chunk.data).toEqual(Buffer.from(data.slice(chunk.byte_offset, chunk.byte_offset + BODY_CONTENT_CHUNK_BYTES)));
    if (scope === 'android') expect(() => host.sqlite.prepare(`DELETE FROM ${host.tables.available}`).run()).toThrow('FOREIGN KEY');
    host.sqlite.prepare(`DELETE FROM ${host.tables.pins} WHERE transfer_id = ?`).run(new Uint8Array(32).fill(1));
    expect(host.rows(host.tables.pins)).toHaveLength(1);
    expect(host.rows(host.tables.chunks)).toHaveLength(chunks.length);
    host.sqlite.prepare(`DELETE FROM ${host.tables.pins}`).run();
    host.sqlite.prepare(`DELETE FROM ${host.tables.available}`).run();
    expect(host.rows(host.tables.chunks)).toEqual([]);
  } finally { host.sqlite.close(); }
});

it.each(scopes)('rolls back %s attached headers, chunks, binary source and pins for a bad later hash', async (scope) => {
  const host = nativeAvailableDatabase(scope);
  try {
    const first = host.insert(new Uint8Array(BODY_CONTENT_CHUNK_BYTES + 3).fill(255));
    const second = host.insert(Buffer.from('original'));
    host.pin(first, 1, 1, 1);
    host.pin(second, 2, 5, 0);
    host.sqlite.prepare(`UPDATE ${host.tables.available} SET data = ? WHERE sha256 = ?`).run(Buffer.from('tampered'), second.sha256);
    const before = host.rows(host.tables.available);
    const pins = host.rows(host.tables.pins);
    const keys = host.keys();
    await expect(host.db.transaction((tx) => migrateFramedSyncAvailableBlobs(tx, scope))).rejects.toThrow('blob_hash_mismatch');
    expect(host.rows(host.tables.available)).toEqual(before);
    expect(host.rows(host.tables.pins)).toEqual(pins);
    expect(host.keys()).toEqual(keys);
    expect(host.temporaryTables()).toEqual([]);
    expect(host.sqlite.prepare(`SELECT name FROM ${host.schema}.sqlite_master WHERE name = ?`)
      .get(`${host.prefix}_available_blob_chunks`)).toBeUndefined();
  } finally { host.sqlite.close(); }
});
