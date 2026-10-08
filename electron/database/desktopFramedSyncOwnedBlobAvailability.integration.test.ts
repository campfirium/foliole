// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { TEXT_BODY_MAX_BYTES } from '../../lib/core/nodes/textBodyBudget.js';

import { blob, openBlobDatabase, prepareBlobTransfer } from './desktopFramedSyncBlobStaging.testSupport.js';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));

async function host() {
  const value = openBlobDatabase();
  cleanups.push(value.close);
  return value;
}

async function stage(value: Awaited<ReturnType<typeof host>>, text: string, seed: string) {
  const body = blob(text);
  const transfer = await prepareBlobTransfer({ database: value, blobs: [body.descriptor], attemptSeed: 7, seed });
  await value.blobStaging.commitBlobOfferAndMissingSet({ blobs: [body.descriptor], transferId: transfer.transferId });
  if (body.data.byteLength > 0) {
    value.sqlite.prepare('INSERT INTO framed_sync_blob_chunks VALUES (?, ?, ?, ?, ?)')
      .run(transfer.transferId, transfer.attemptId, body.descriptor.sha256, 0, body.data);
  }
  const verify = () => value.blobStaging.verifyAndMarkBlobAvailable(transfer.transferId, transfer.attemptId, body.descriptor.sha256);
  return { body, transfer, verify };
}

it('pins a complete one-MiB Unicode body once and retains ready bytes after attempt retirement', async () => {
  const value = await host();
  const prefix = '\uFEFF中😀\u0000'.repeat(70_000);
  const text = prefix + 'x'.repeat(TEXT_BODY_MAX_BYTES - new TextEncoder().encode(prefix).byteLength);
  const { body, transfer, verify } = await stage(value, text, 'large');
  expect(await verify()).toBe('available');
  expect(await verify()).toBe('identical');
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_pins').pluck().get()).toBe(1);
  const data = value.sqlite.prepare('SELECT data FROM framed_sync_available_blobs WHERE sha256 = ?')
    .pluck().get(body.descriptor.sha256) as Uint8Array;
  expect(new Uint8Array(data)).toEqual(body.data);
  await value.port.run("UPDATE framed_sync_inbound_transfers SET state = 'receiving', canonical_manifest = ? WHERE transfer_id = ?",
    [new Uint8Array([1]), transfer.transferId]);
  await value.blobStaging.markReadyToApply(transfer.transferId);
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_chunks').pluck().get()).toBe(0);
  expect(new Uint8Array(value.sqlite.prepare('SELECT data FROM framed_sync_available_blobs WHERE sha256 = ?')
    .pluck().get(body.descriptor.sha256) as Uint8Array)).toEqual(body.data);
  expect(data.byteLength).toBe(TEXT_BODY_MAX_BYTES);
});

it('rolls back available bytes and pins on a bad receiving digest and permits retry', async () => {
  const value = await host();
  const { body, verify } = await stage(value, 'x'.repeat(TEXT_BODY_MAX_BYTES), 'bad-digest');
  value.sqlite.prepare('UPDATE framed_sync_blob_chunks SET data = zeroblob(length(data)) WHERE byte_offset = 0').run();
  await expect(verify()).rejects.toThrow('blob_hash_mismatch');
  for (const table of ['framed_sync_available_blobs', 'framed_sync_blob_pins']) {
    expect(value.sqlite.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0);
  }
  value.sqlite.prepare('UPDATE framed_sync_blob_chunks SET data = ? WHERE byte_offset = 0').run(body.data);
  expect(await verify()).toBe('available');
});

it.each(['length', 'bytes'] as const)('rejects conflicting available %s without overwriting bytes or adding a pin', async (fault) => {
  const value = await host();
  const { body, verify } = await stage(value, 'Original', fault);
  const existing = fault === 'bytes' ? new Uint8Array(body.data.byteLength) : body.data;
  value.sqlite.prepare('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)')
    .run(body.descriptor.sha256, body.data.byteLength + (fault === 'length' ? 1 : 0), existing);
  await expect(verify()).rejects.toThrow('blob_available_identity_conflict');
  expect(new Uint8Array(value.sqlite.prepare('SELECT data FROM framed_sync_available_blobs').pluck().get() as Uint8Array))
    .toEqual(existing);
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_pins').pluck().get()).toBe(0);
});

it('verifies an empty body without requiring a receiving payload', async () => {
  const value = await host();
  const { verify } = await stage(value, '', 'empty');
  expect(await verify()).toBe('available');
  expect(await verify()).toBe('identical');
  expect(value.sqlite.prepare('SELECT length(data) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_chunks').pluck().get()).toBe(0);
});

it.each(['gap', 'short', 'oversized'] as const)('rejects %s receiving coverage without making a body available', async (fault) => {
  const value = await host();
  const { verify } = await stage(value, 'x'.repeat(TEXT_BODY_MAX_BYTES), fault);
  if (fault === 'gap') value.sqlite.exec('UPDATE framed_sync_blob_chunks SET byte_offset = 1 WHERE byte_offset = 0');
  if (fault === 'short') value.sqlite.exec('DELETE FROM framed_sync_blob_chunks');
  if (fault === 'oversized') value.sqlite.exec(`UPDATE framed_sync_blob_chunks SET data = zeroblob(${TEXT_BODY_MAX_BYTES + 1}) WHERE byte_offset = 0`);
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
  for (const table of ['framed_sync_available_blobs', 'framed_sync_blob_pins']) {
    expect(value.sqlite.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0);
  }
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_blob_chunks').pluck().get())
    .toBe(fault === 'empty-extra' ? 1 : 2);
});
