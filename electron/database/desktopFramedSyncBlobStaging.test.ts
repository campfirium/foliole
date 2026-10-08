// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';

import {
  blob,
  digest,
  openBlobDatabase,
  prepareBlobTransfer,
  promoteBlob
} from './desktopFramedSyncBlobStaging.testSupport.js';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

it('exchanges the body each SQLite peer is missing and pins verified offers', async () => {
  const peerA = openBlobDatabase();
  const peerB = openBlobDatabase();
  cleanups.push(peerA.close, peerB.close);
  const bodyA = blob('body-owned-by-a');
  const bodyB = blob('body-owned-by-b');
  const seedA = await prepareBlobTransfer({ attemptSeed: 1, blobs: [bodyA.descriptor],
    database: peerA, seed: 'seed-a' });
  const seedB = await prepareBlobTransfer({ attemptSeed: 2, blobs: [bodyB.descriptor],
    database: peerB, seed: 'seed-b' });
  await promoteBlob({ ...seedA, database: peerA, value: bodyA });
  await promoteBlob({ ...seedB, database: peerB, value: bodyB });
  const toA = await prepareBlobTransfer({ attemptSeed: 3, blobs: [bodyB.descriptor],
    database: peerA, seed: 'to-a' });
  const toB = await prepareBlobTransfer({ attemptSeed: 4, blobs: [bodyA.descriptor],
    database: peerB, seed: 'to-b' });

  await expect(peerA.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [bodyB.descriptor], transferId: toA.transferId
  })).resolves.toEqual([bodyB.descriptor.sha256]);
  await expect(peerB.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [bodyA.descriptor], transferId: toB.transferId
  })).resolves.toEqual([bodyA.descriptor.sha256]);
  await promoteBlob({ ...toA, database: peerA, value: bodyB });
  await promoteBlob({ ...toB, database: peerB, value: bodyA });
  expect(peerA.sqlite.prepare('SELECT count(*) AS count FROM framed_sync_available_blobs').get())
    .toEqual({ count: 2 });
  expect(peerB.sqlite.prepare('SELECT count(*) AS count FROM framed_sync_available_blobs').get())
    .toEqual({ count: 2 });
});

it('restores attempt coverage and accepts an identical chunk replay after SQLite reopens', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-framed-blob-'));
  cleanups.push(() => fs.rm(root, { force: true, recursive: true }));
  const filePath = path.join(root, 'blob.db');
  let database = openBlobDatabase(filePath);
  const value = blob(`${'x'.repeat(FRAMED_SYNC_LIMITS.blobChunkBytes)}tail`);
  const descriptor = { ...value.descriptor, role: 2 };
  const transfer = await prepareBlobTransfer({ attemptSeed: 5, blobs: [descriptor],
    database, seed: 'restart' });
  await database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [descriptor], transferId: transfer.transferId
  });
  const tail = { ...transfer, data: value.data.slice(FRAMED_SYNC_LIMITS.blobChunkBytes),
    offset: BigInt(FRAMED_SYNC_LIMITS.blobChunkBytes), sha256: descriptor.sha256 };
  expect(await database.blobStaging.writeBlobChunk(tail)).toBe('created');
  database.close();

  database = openBlobDatabase(filePath);
  cleanups.push(database.close);
  expect(await database.blobStaging.writeBlobChunk(tail)).toBe('identical');
  await expect(database.blobStaging.verifyAndMarkBlobAvailable(
    transfer.transferId, transfer.attemptId, descriptor.sha256
  )).rejects.toThrow('blob_coverage_incomplete');
  expect(await database.blobStaging.writeBlobChunk({ ...transfer,
    data: value.data.slice(0, FRAMED_SYNC_LIMITS.blobChunkBytes), offset: 0n,
    sha256: descriptor.sha256
  })).toBe('created');
  expect(await database.blobStaging.verifyAndMarkBlobAvailable(
    transfer.transferId, transfer.attemptId, descriptor.sha256
  )).toBe('available');
});

it('rejects overlapping replacement bytes while preserving the original chunk', async () => {
  const database = openBlobDatabase();
  cleanups.push(database.close);
  const value = blob('original');
  const transfer = await prepareBlobTransfer({ attemptSeed: 6, blobs: [value.descriptor],
    database, seed: 'overlap' });
  await database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [value.descriptor], transferId: transfer.transferId
  });
  await database.blobStaging.writeBlobChunk({ ...transfer, data: value.data, offset: 0n,
    sha256: value.descriptor.sha256 });

  await expect(database.blobStaging.writeBlobChunk({ ...transfer,
    data: new TextEncoder().encode('replaced'), offset: 0n, sha256: value.descriptor.sha256
  })).rejects.toThrow('blob_chunk_overlap');
  await expect(database.blobStaging.verifyAndMarkBlobAvailable(
    transfer.transferId, transfer.attemptId, value.descriptor.sha256
  )).resolves.toBe('available');
});

it('checks complete length and SHA-256 before hash-scoped availability promotion', async () => {
  const database = openBlobDatabase();
  cleanups.push(database.close);
  const expected = blob('expected');
  const transfer = await prepareBlobTransfer({ attemptSeed: 7, blobs: [expected.descriptor],
    database, seed: 'hash' });
  await database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [expected.descriptor], transferId: transfer.transferId
  });
  await expect(database.blobStaging.writeBlobChunk({ ...transfer,
    data: new TextEncoder().encode('short'), offset: 0n, sha256: expected.descriptor.sha256
  })).rejects.toThrow('blob_chunk_length_invalid');
  await database.blobStaging.writeBlobChunk({ ...transfer,
    data: new TextEncoder().encode('xxxxxxxx'), offset: 0n, sha256: expected.descriptor.sha256 });
  await expect(database.blobStaging.verifyAndMarkBlobAvailable(
    transfer.transferId, transfer.attemptId, expected.descriptor.sha256
  )).rejects.toThrow('blob_hash_mismatch');
  expect(database.sqlite.prepare('SELECT count(*) AS count FROM framed_sync_available_blobs').get())
    .toEqual({ count: 0 });
});

it('reuses verified hash content for a new transfer and commits its durable pin atomically', async () => {
  const database = openBlobDatabase();
  cleanups.push(database.close);
  const value = blob('shared-hash');
  const first = await prepareBlobTransfer({ attemptSeed: 8, blobs: [value.descriptor],
    database, seed: 'first' });
  await promoteBlob({ ...first, database, value });
  const second = await prepareBlobTransfer({ attemptSeed: 9, blobs: [value.descriptor],
    database, seed: 'second' });

  await expect(database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [value.descriptor], transferId: second.transferId
  })).resolves.toEqual([]);
  expect(database.sqlite.prepare(`SELECT count(*) AS count FROM framed_sync_blob_pins
    WHERE transfer_id = ? AND sha256 = ?`).get(second.transferId, value.descriptor.sha256))
    .toEqual({ count: 1 });
});

it('clears a failed attempt without damaging independently verified hash content', async () => {
  const database = openBlobDatabase();
  cleanups.push(database.close);
  const verified = blob('verified');
  const partial = blob('partial');
  const stable = await prepareBlobTransfer({ attemptSeed: 10, blobs: [verified.descriptor],
    database, seed: 'stable' });
  await promoteBlob({ ...stable, database, value: verified });
  const failed = await prepareBlobTransfer({ attemptSeed: 11, blobs: [partial.descriptor],
    database, seed: 'failed' });
  await database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [partial.descriptor], transferId: failed.transferId
  });
  await database.blobStaging.writeBlobChunk({ ...failed, data: partial.data, offset: 0n,
    sha256: partial.descriptor.sha256 });
  await database.staging.invalidateInboundAttempt(failed.transferId, failed.attemptId);

  expect(database.sqlite.prepare(`SELECT count(*) AS count FROM framed_sync_blob_chunks
    WHERE transfer_id = ? AND attempt_id = ?`).get(failed.transferId, failed.attemptId))
    .toEqual({ count: 0 });
  expect(database.sqlite.prepare(`SELECT count(*) AS count FROM framed_sync_blob_offers
    WHERE transfer_id = ? AND attempt_id = ?`).get(failed.transferId, failed.attemptId))
    .toEqual({ count: 0 });
  expect(database.sqlite.prepare(`SELECT count(*) AS count FROM framed_sync_available_blobs
    WHERE sha256 = ?`).get(verified.descriptor.sha256)).toEqual({ count: 1 });
  expect(database.sqlite.prepare(`SELECT count(*) AS count FROM framed_sync_blob_pins
    WHERE transfer_id = ?`).get(stable.transferId)).toEqual({ count: 1 });
});

it('rejects a conflicting persisted descriptor for an already available hash', async () => {
  const database = openBlobDatabase();
  cleanups.push(database.close);
  const value = blob('identity');
  const transfer = await prepareBlobTransfer({ attemptSeed: 12, blobs: [value.descriptor],
    database, seed: 'identity-conflict' });
  database.sqlite.prepare('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)')
    .run(value.descriptor.sha256, value.data.byteLength + 1, Buffer.concat([value.data, Buffer.of(0)]));

  await expect(database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [value.descriptor], transferId: transfer.transferId
  })).rejects.toThrow('blob_available_identity_conflict');
  expect(database.sqlite.prepare('SELECT count(*) AS count FROM framed_sync_blob_pins').get())
    .toEqual({ count: 0 });
});

it('uses the SHA-256 hash rather than transfer identity for persisted availability', async () => {
  const database = openBlobDatabase();
  cleanups.push(database.close);
  const value = blob('hash-scope');
  const first = await prepareBlobTransfer({ attemptSeed: 13, blobs: [value.descriptor],
    database, seed: 'hash-first' });
  await promoteBlob({ ...first, database, value });
  const second = await prepareBlobTransfer({ attemptSeed: 14, blobs: [value.descriptor],
    database, seed: 'hash-second' });
  expect(Buffer.from(first.transferId).equals(Buffer.from(second.transferId))).toBe(false);
  expect(Buffer.from(value.descriptor.sha256).equals(Buffer.from(digest(value.data)))).toBe(true);

  await expect(database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [value.descriptor], transferId: second.transferId
  })).resolves.toEqual([]);
});
