// @vitest-environment node
import { expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { encodeFramedSyncStream, readFramedSyncStream } from './desktopFramedSyncStream.js';
import { receiveVerifiedDesktopFramedSyncTransfer } from './desktopFramedSyncVerifiedReceiver.js';
import { receiverBusinessRows, verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

const unicode = '\ufeff中😀\0文';
const prefix = unicode.repeat(Math.floor(1_048_576 / Buffer.byteLength(unicode)));
const body = prefix + 'a'.repeat(1_048_576 - Buffer.byteLength(prefix));

async function receive(fixture: Awaited<ReturnType<typeof verifiedReceiverFixture>>, tamper = false) {
  return receiveVerifiedDesktopFramedSyncTransfer({ ...fixture.receiver, context: fixture.context,
    groupKey: fixture.groupKey, stream: await fixture.stream(tamper) });
}

async function assertCommitted(fixture: Awaited<ReturnType<typeof verifiedReceiverFixture>>, result: Awaited<ReturnType<typeof receive>>) {
  const receipt = await readReceipt({ groupKey: fixture.groupKey, published: fixture.published,
    stream: await readFramedSyncStream(encodeFramedSyncStream(result)) });
  expect(receipt).toEqual(await fixture.receiver.staging.loadReceipt(fixture.published.transferId));
  expect(receipt.transferId).toEqual(fixture.published.transferId);
  const current = await loadCurrentSyncNodeRecord(fixture.receiver.db, fixture.record.object_id);
  expect(current?.version_id).toBe(fixture.record.version_id);
  expect(current?.content_hash).toBe(fixture.record.content_hash);
  expect(current?.body_text).toBe(body);
  expect(fixture.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(0);
  expect(fixture.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_chunks').pluck().get()).toBe(0);
}

it('receives large Unicode through production encrypted sender frames and returns an authenticated receipt', async () => {
  const fixture = await verifiedReceiverFixture(body);
  try { await assertCommitted(fixture, await receive(fixture)); }
  finally { fixture.close(); }
});

it('keeps durable ready after receipt rollback and retries the same authenticated transfer after reopening SQLite', async () => {
  const fixture = await verifiedReceiverFixture(body);
  try {
    const before = receiverBusinessRows(fixture);
    fixture.receiver.sqlite.exec(`CREATE TRIGGER reject_stream_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'stream_receipt_rejected'); END`);
    await expect(receive(fixture)).rejects.toThrow('stream_receipt_rejected');
    expect(receiverBusinessRows(fixture)).toEqual(before);
    expect(fixture.receiver.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').get()).toEqual({ state: 'ready_to_apply' });
    const pins = fixture.receiver.sqlite.prepare('SELECT * FROM framed_sync_blob_pins').all();
    expect(pins.length).toBeGreaterThan(0);
    const available = fixture.receiver.sqlite.prepare('SELECT * FROM framed_sync_available_blobs').all();
    const chunks = fixture.receiver.sqlite.prepare('SELECT sha256, byte_offset, length(data) AS byte_length FROM framed_sync_blob_chunks ORDER BY byte_offset').all();
    expect(chunks).toEqual([]);
    expect(available).toContainEqual(expect.objectContaining({ data: Buffer.from(body) }));
    fixture.reopen();
    expect(fixture.receiver.sqlite.prepare('SELECT * FROM framed_sync_blob_pins').all()).toEqual(pins);
    expect(fixture.receiver.sqlite.prepare('SELECT * FROM framed_sync_available_blobs').all()).toEqual(available);
    expect(fixture.receiver.sqlite.prepare('SELECT sha256, byte_offset, length(data) AS byte_length FROM framed_sync_blob_chunks ORDER BY byte_offset').all()).toEqual(chunks);
    fixture.receiver.sqlite.exec('DROP TRIGGER reject_stream_receipt');
    await assertCommitted(fixture, await receive(fixture));
  } finally { fixture.close(); }
});

it('rejects tampered authenticated ciphertext before any staging or business write', async () => {
  const fixture = await verifiedReceiverFixture(body);
  try {
    const before = receiverBusinessRows(fixture);
    await expect(receive(fixture, true)).rejects.toThrow('frame_authentication_failed');
    expect(receiverBusinessRows(fixture)).toEqual(before);
    expect(fixture.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_inbound_transfers').pluck().get()).toBe(0);
    expect(fixture.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(0);
    expect(fixture.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
  } finally { fixture.close(); }
});

it('keeps the complete received body durable before the trailer without retaining a second frame plaintext', async () => {
  const fixture = await verifiedReceiverFixture(body);
  let checked = false;
  try {
    const stream = await fixture.stream();
    const result = await receiveVerifiedDesktopFramedSyncTransfer({ ...fixture.receiver, context: fixture.context,
      groupKey: fixture.groupKey, stream: { ...stream, frames: (async function* () {
        for await (const frame of stream.frames) {
          yield frame;
          if (frame.header.frameType !== 4) continue;
          expect(fixture.receiver.sqlite.prepare('SELECT data FROM framed_sync_blob_chunks').pluck().get())
            .toEqual(Buffer.from(body));
          expect(fixture.receiver.sqlite.prepare(`SELECT length(authenticated_plaintext)
            FROM framed_sync_inbound_frames WHERE frame_type = 4`).pluck().get()).toBe(32);
          expect(fixture.receiver.sqlite.prepare('SELECT count(*) FROM nodes WHERE id = ?').pluck().get('topic')).toBe(0);
          checked = true;
        }
      })() } });
    expect(checked).toBe(true);
    await assertCommitted(fixture, result);
  } finally { fixture.close(); }
});
