import { describe, expect, it } from 'vitest';

import {
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PREAMBLE
} from '../../lib/core/sync/framedSyncContract.js';
import {
  encodeFrameHeader,
  encodeFramedSyncPreamble
} from '../../lib/core/sync/framedSyncFraming.js';

import {
  encodeFramedSyncStream,
  readFramedSyncStream
} from './desktopFramedSyncStream.js';

const preamble = encodeFramedSyncPreamble({
  compression: 'none',
  contextId: new Uint8Array(32),
  contextKind: 'session',
  noncePrefix: new Uint8Array(4),
  sessionId: new Uint8Array(16),
  startingSequence: 0n
});
const header = encodeFrameHeader({ ciphertextBytes: 4, flags: 0, frameType: 1, sequence: 0n });

async function* chunks(value: Uint8Array, sizes: readonly number[] = [1, 7, 3]) {
  let offset = 0;
  let index = 0;
  while (offset < value.byteLength) {
    const size = sizes[index % sizes.length] ?? 1;
    yield value.subarray(offset, Math.min(offset + size, value.byteLength));
    offset += size;
    index += 1;
  }
}

async function collect(source: AsyncIterable<Uint8Array>) {
  const result: Uint8Array[] = [];
  for await (const value of source) result.push(value);
  return Buffer.concat(result.map((value) => Buffer.from(value)));
}

async function drain(source: AsyncIterable<unknown>) {
  for await (const value of source) void value;
}

describe('desktop framed sync stream', () => {
  it('reads a fragmented preamble, header, and binary body without text conversion', async () => {
    const body = Uint8Array.of(0, 255, 1, 254);
    const stream = await readFramedSyncStream(chunks(Buffer.concat([
      Buffer.from(preamble), Buffer.from(header), Buffer.from(body)
    ])));
    const frames = [];
    for await (const frame of stream.frames) frames.push(frame);

    expect(stream.preamble).toEqual(preamble);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.header).toMatchObject({ ciphertextBytes: 4, frameType: 1, sequence: 0n });
    expect(frames[0]?.ciphertext).toEqual(body);
  });

  it.each([
    ['preamble', preamble.subarray(0, 95), 'framed_sync_preamble_truncated'],
    ['header', Buffer.concat([Buffer.from(preamble), Buffer.from(header.subarray(0, 15))]),
      'framed_sync_frame_header_truncated'],
    ['body', Buffer.concat([Buffer.from(preamble), Buffer.from(header), Buffer.from([1, 2, 3])]),
      'framed_sync_frame_body_truncated']
  ])('rejects a truncated %s', async (_name, input, error) => {
    const streamPromise = readFramedSyncStream(chunks(input));
    if (error === 'framed_sync_preamble_truncated') {
      await expect(streamPromise).rejects.toThrow(error);
      return;
    }
    const stream = await streamPromise;
    await expect(drain(stream.frames)).rejects.toThrow(error);
  });

  it('rejects an oversized body from the bounded header before reading it', async () => {
    const oversizedHeader = new Uint8Array(FRAMED_SYNC_PREAMBLE.frameHeaderBytes);
    const view = new DataView(oversizedHeader.buffer);
    view.setUint32(0, FRAMED_SYNC_LIMITS.maxCiphertextBodyBytes + 1);
    view.setUint16(12, 1);
    const stream = await readFramedSyncStream(chunks(Buffer.concat([
      Buffer.from(preamble), Buffer.from(oversizedHeader)
    ])));
    await expect(drain(stream.frames)).rejects.toThrow('wire_frame_limit_exceeded');
  });

  it('encodes the exact binary stream and rejects mismatched bodies', async () => {
    const body = Uint8Array.of(0, 255, 1, 254);
    async function* frames() { yield { ciphertext: body, headerBytes: header }; }
    expect(await collect(encodeFramedSyncStream({ frames: frames(), preamble })))
      .toEqual(Buffer.concat([Buffer.from(preamble), Buffer.from(header), Buffer.from(body)]));
    async function* shortFrame() { yield { ciphertext: body.subarray(0, 3), headerBytes: header }; }
    await expect(collect(encodeFramedSyncStream({ frames: shortFrame(), preamble })))
      .rejects.toThrow('framed_sync_frame_body_length_mismatch');
  });

});

it('preserves large binary frames from reused source buffers without reading ahead', async () => {
    const size = 2 * 1024 * 1024;
    const largeHeader = encodeFrameHeader({ ciphertextBytes: size, flags: 0, frameType: 1, sequence: 0n });
    let pulls = 0;
    const reusable = new Uint8Array(64 * 1024);
    async function* source() {
      yield preamble;
      yield new Uint8Array();
      yield largeHeader;
      for (let index = 0; index < size / reusable.byteLength; index += 1) {
        reusable.fill(index);
        pulls += 1;
        yield reusable;
      }
      yield header;
      reusable.fill(255);
      pulls += 1;
      yield reusable.subarray(0, 4);
    }
    const stream = await readFramedSyncStream(source());
    const iterator = stream.frames[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done) throw new Error('frame_missing');
    expect(pulls).toBe(32);
    expect(first.value.ciphertext.byteLength).toBe(size);
    const second = await iterator.next();
    if (second.done) throw new Error('frame_missing');
    expect(second.value.ciphertext).toEqual(new Uint8Array(4).fill(255));
    for (let index = 0; index < 32; index += 1) {
      expect(first.value.ciphertext[index * reusable.byteLength]).toBe(index);
      expect(first.value.ciphertext[(index + 1) * reusable.byteLength - 1]).toBe(index);
    }
    expect((await iterator.next()).done).toBe(true);
});

it('closes the source when the preamble is rejected before frame iteration starts', async () => {
    let closed = false;
    async function* source() {
      try { yield new Uint8Array(preamble.byteLength); }
      finally { closed = true; }
    }
    await expect(readFramedSyncStream(source())).rejects.toThrow();
    expect(closed).toBe(true);
});
