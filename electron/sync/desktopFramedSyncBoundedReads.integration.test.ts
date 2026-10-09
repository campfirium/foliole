// @vitest-environment node

import { createHash } from 'node:crypto';

import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { createDesktopFramedSyncBlobStaging } from '../database/desktopFramedSyncBlobStaging.js';
import { blob, openBlobDatabase, prepareBlobTransfer } from '../database/desktopFramedSyncBlobStaging.testSupport.js';

import { loadDesktopFramedSyncPublishedBlobSources } from './desktopFramedSyncBlobSources.js';

function observeReads(port: DbPort) {
  let peakBytes = 0;
  let totalBytes = 0;
  const observed: DbPort = {
    run: (sql, params) => port.run(sql, params),
    async query<T extends DbRow>(sql: string, params: DbParams = []): Promise<T[]> {
      const rows = await port.query<T>(sql, params);
      const bytes = rows.reduce((sum, row) => sum + Object.values(row)
        .reduce<number>((size, value) => size + (value instanceof Uint8Array ? value.byteLength : 0), 0), 0);
      peakBytes = Math.max(peakBytes, bytes);
      totalBytes += bytes;
      return rows;
    },
    transaction: (execute) => port.transaction((tx) => execute(observeTransaction(tx)))
  };
  function observeTransaction(tx: DbPort): DbPort {
    return { ...observed, run: (sql, params) => tx.run(sql, params),
      query: async <T extends DbRow>(sql: string, params: DbParams = []): Promise<T[]> => {
        const rows = await tx.query<T>(sql, params);
        const bytes = rows.reduce((sum, row) => sum + Object.values(row)
          .reduce<number>((size, value) => size + (value instanceof Uint8Array ? value.byteLength : 0), 0), 0);
        peakBytes = Math.max(peakBytes, bytes);
        totalBytes += bytes;
        return rows;
      } };
  }
  return { port: observed, peak: () => peakBytes, total: () => totalBytes };
}

it('reads one complete frozen 1 MiB UTF-8 body within the per-body budget', async () => {
  const database = openBlobDatabase();
  try {
    const data = Buffer.from('中😀'.repeat(Math.floor(1024 * 1024 / 7)) + 'abcd');
    expect(data.byteLength).toBe(1024 * 1024);
    const hash = createHash('sha256').update(data).digest();
    database.sqlite.prepare('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)').run(hash, data.byteLength, data);
    const reads = observeReads(database.port);
    const descriptor = { byteLength: BigInt(data.byteLength), required: true, role: 1, sha256: hash };
    const sources = await loadDesktopFramedSyncPublishedBlobSources(reads.port, { blobs: [descriptor], facts: [] });
    const actual = createHash('sha256');
    let count = 0;
    let size = 0;
    for await (const bytes of sources[0]!.chunks()) {
      expect(bytes.byteLength).toBeLessThanOrEqual(1024 * 1024);
      expect(Buffer.from(bytes).equals(data.subarray(size, size + bytes.byteLength))).toBe(true);
      actual.update(bytes);
      size += bytes.byteLength;
      count += 1;
    }
    expect(actual.digest()).toEqual(hash);
    expect(size).toBe(data.byteLength);
    expect(count).toBe(1);
    expect(reads.peak()).toBeLessThanOrEqual(1024 * 1024);
  } finally {
    database.close();
  }
});

it('receives attachment blocks out of order and compares only the replayed block', async () => {
  const database = openBlobDatabase();
  try {
    const original = blob('x'.repeat(3 * 1024 * 1024));
    const value = { ...original, descriptor: { ...original.descriptor, role: 2 } };
    const transfer = await prepareBlobTransfer({ attemptSeed: 19, blobs: [value.descriptor],
      database, seed: 'bounded-chunk-replay' });
    await database.blobStaging.commitBlobOfferAndMissingSet({ blobs: [value.descriptor], transferId: transfer.transferId });
    const reads = observeReads(database.port);
    const staging = createDesktopFramedSyncBlobStaging(reads.port);
    for (const index of [5, 1, 3, 0, 2, 4]) {
      const offset = index * FRAMED_SYNC_LIMITS.blobChunkBytes;
      await staging.writeBlobChunk({ ...transfer, sha256: value.descriptor.sha256,
        offset: BigInt(offset), data: value.data.subarray(offset, offset + FRAMED_SYNC_LIMITS.blobChunkBytes) });
    }
    const beforeReplay = reads.total();
    const replay = { ...transfer, sha256: value.descriptor.sha256, offset: 0n,
      data: value.data.subarray(0, FRAMED_SYNC_LIMITS.blobChunkBytes) };
    await expect(staging.writeBlobChunk(replay)).resolves.toBe('identical');
    expect(reads.total() - beforeReplay).toBeLessThanOrEqual(FRAMED_SYNC_LIMITS.blobChunkBytes + 80);
    expect(reads.peak()).toBeLessThanOrEqual(FRAMED_SYNC_LIMITS.blobChunkBytes);
    await expect(staging.writeBlobChunk({ ...replay, data: replay.data.map(() => 121) }))
      .rejects.toThrow('blob_chunk_overlap');
    await expect(staging.verifyAndMarkBlobAvailable(transfer.transferId, transfer.attemptId,
      value.descriptor.sha256)).resolves.toBe('available');
  } finally {
    database.close();
  }
});
