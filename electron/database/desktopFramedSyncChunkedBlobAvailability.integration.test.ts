// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { BODY_CONTENT_CHUNK_BYTES } from '../../lib/core/database/bodyContentSchema.js';
import { migrateFramedSyncAvailableBlobs } from '../../lib/core/database/framedSyncAvailableBlobMigration.js';
import { verifyAvailableBlobChunks } from '../../lib/core/database/framedSyncAvailableBlobVerification.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';

import { createDesktopFramedSyncBlobStaging } from './desktopFramedSyncBlobStaging.js';
import { blob, openBlobDatabase, prepareBlobTransfer } from './desktopFramedSyncBlobStaging.testSupport.js';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));

async function host() {
  const value = openBlobDatabase();
  cleanups.push(value.close);
  await value.port.transaction((tx) => migrateFramedSyncAvailableBlobs(tx, 'desktop'));
  const sizes: number[] = [];
  const observe = (source: DbPort): DbPort => ({ ...source,
    query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
      const rows = await source.query<T>(sql, params);
      const data = rows.filter((row) => row.data instanceof Uint8Array);
      expect(data.length).toBeLessThanOrEqual(1);
      for (const row of data) {
        const size = (row.data as Uint8Array).byteLength;
        expect(size).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
        sizes.push(size);
      }
      return rows;
    }, transaction: (run) => source.transaction((tx) => run(observe(tx)))
  });
  return { ...value, blobStaging: createDesktopFramedSyncBlobStaging(observe(value.port), 'chunked'), sizes };
}

async function stage(value: Awaited<ReturnType<typeof host>>, text: string, seed: string) {
  const body = blob(text);
  const transfer = await prepareBlobTransfer({ database: value, blobs: [body.descriptor], attemptSeed: 7, seed });
  await value.blobStaging.commitBlobOfferAndMissingSet({ blobs: [body.descriptor], transferId: transfer.transferId });
  for (let offset = 0; offset < body.data.byteLength; offset += 201_111) {
    value.sqlite.prepare('INSERT INTO framed_sync_blob_chunks VALUES (?, ?, ?, ?, ?)')
      .run(transfer.transferId, transfer.attemptId, body.descriptor.sha256, offset,
        body.data.subarray(offset, Math.min(body.data.byteLength, offset + 201_111)));
  }
  const verify = () => value.blobStaging.verifyAndMarkBlobAvailable(transfer.transferId, transfer.attemptId, body.descriptor.sha256);
  return { body, transfer, verify };
}

it('reblocks non-aligned Unicode receiving slices, pins once and retains ready content after attempt retirement', async () => {
  const value = await host();
  const { body, transfer, verify } = await stage(value, '中😀'.repeat(500_000), 'large');
  expect(await verify()).toBe('available');
  expect(await verify()).toBe('identical');
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  for (let offset = 0; offset < body.data.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    const data = value.sqlite.prepare('SELECT data FROM framed_sync_available_blob_chunks WHERE sha256 = ? AND byte_offset = ?')
      .pluck().get(body.descriptor.sha256, offset) as Uint8Array;
    expect(new Uint8Array(data)).toEqual(body.data.subarray(offset, offset + BODY_CONTENT_CHUNK_BYTES));
  }
  await value.port.run("UPDATE framed_sync_inbound_transfers SET state = 'receiving', canonical_manifest = ? WHERE transfer_id = ?",
    [new Uint8Array([1]), transfer.transferId]);
  await value.blobStaging.markReadyToApply(transfer.transferId);
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_chunks').pluck().get()).toBe(0);
  await expect(verifyAvailableBlobChunks(value.port, 'desktop', body.descriptor)).resolves.toBeUndefined();
  expect(Math.max(...value.sizes)).toBe(BODY_CONTENT_CHUNK_BYTES);
});

it('rolls back headers, target chunks and pins on a bad receiving digest and permits retry', async () => {
  const value = await host();
  const { body, verify } = await stage(value, 'x'.repeat(BODY_CONTENT_CHUNK_BYTES + 100), 'bad-digest');
  value.sqlite.prepare('UPDATE framed_sync_blob_chunks SET data = zeroblob(length(data)) WHERE byte_offset = 0').run();
  await expect(verify()).rejects.toThrow('blob_hash_mismatch');
  for (const table of ['framed_sync_available_blobs', 'framed_sync_available_blob_chunks', 'framed_sync_blob_pins']) {
    expect(value.sqlite.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0);
  }
  value.sqlite.prepare('UPDATE framed_sync_blob_chunks SET data = ? WHERE byte_offset = 0').run(body.data.subarray(0, 201_111));
  expect(await verify()).toBe('available');
});

it('checks existing available length and every persisted byte even when a matching pin exists', async () => {
  const value = await host();
  const { verify } = await stage(value, 'Original', 'existing');
  await verify();
  value.sqlite.exec('UPDATE framed_sync_available_blobs SET byte_length = byte_length + 1');
  await expect(verify()).rejects.toThrow('blob_available_identity_conflict');
  value.sqlite.exec('UPDATE framed_sync_available_blobs SET byte_length = byte_length - 1');
  value.sqlite.exec('UPDATE framed_sync_available_blob_chunks SET data = zeroblob(length(data))');
  await expect(verify()).rejects.toThrow('blob_hash_mismatch');
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
});

it('verifies empty blobs without creating a target chunk', async () => {
  const value = await host();
  const { verify } = await stage(value, '', 'empty');
  expect(await verify()).toBe('available');
  expect(await verify()).toBe('identical');
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_available_blob_chunks').pluck().get()).toBe(0);
});

it.each(['gap', 'short', 'oversized'] as const)('rejects %s receiving coverage with bounded reads and no adopted owner', async (fault) => {
  const value = await host();
  const { verify } = await stage(value, 'x'.repeat(BODY_CONTENT_CHUNK_BYTES + 100), fault);
  if (fault === 'gap') value.sqlite.exec('UPDATE framed_sync_blob_chunks SET byte_offset = 1 WHERE byte_offset = 0');
  if (fault === 'short') value.sqlite.exec('DELETE FROM framed_sync_blob_chunks WHERE byte_offset = 402222');
  if (fault === 'oversized') value.sqlite.exec(`UPDATE framed_sync_blob_chunks SET data = zeroblob(${BODY_CONTENT_CHUNK_BYTES + 1}) WHERE byte_offset = 0`);
  await expect(verify()).rejects.toThrow('blob_coverage_incomplete');
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_pins').pluck().get()).toBe(0);
});

it.each(['overlap', 'empty-extra', 'end-extra'] as const)('rejects %s persisted chunks and rolls back the complete verification transaction', async (fault) => {
  const value = await host();
  const { body, transfer, verify } = await stage(value, fault === 'empty-extra' ? '' : 'Original', fault);
  const offset = fault === 'overlap' ? 1 : body.data.byteLength;
  value.sqlite.prepare('INSERT INTO framed_sync_blob_chunks VALUES (?, ?, ?, ?, ?)')
    .run(transfer.transferId, transfer.attemptId, body.descriptor.sha256, offset, Buffer.of(1));
  await expect(verify()).rejects.toThrow('blob_coverage_incomplete');
  for (const table of ['framed_sync_available_blobs', 'framed_sync_available_blob_chunks', 'framed_sync_blob_pins']) {
    expect(value.sqlite.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0);
  }
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_chunks').pluck().get())
    .toBe(fault === 'empty-extra' ? 1 : 2);
});
