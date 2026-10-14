// @vitest-environment node
import { createHash } from 'node:crypto';

import { expect, it, vi } from 'vitest';

vi.mock('./desktopFramedSyncBodySpool.js', async importOriginal => {
  const original = await importOriginal<typeof import('./desktopFramedSyncBodySpool.js')>();
  return { ...original, spoolDesktopFramedSyncBody: vi.fn(original.spoolDesktopFramedSyncBody) };
});

import { encodeFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { encodeFrameHeader, encodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { REQUEST_SYNC_MEMORY_BYTES } from '../../lib/core/sync/requestSyncFiles.js';

import { spoolDesktopFramedSyncBody } from './desktopFramedSyncBodySpool.js';
import { encodeFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';
import { retainDesktopFramedSyncSealedBody } from './desktopFramedSyncSealedBody.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';

it.each([1, 10])('preserves signed bytes and bounded scratch use for %i frames', async count => {
  vi.mocked(spoolDesktopFramedSyncBody).mockClear();
  const preamble = encodeFramedSyncPreamble({ compression: 'none', contextKind: 'session',
    contextId: new Uint8Array(32), noncePrefix: new Uint8Array(4), sessionId: new Uint8Array(16), startingSequence: 0n });
  const frames = Array.from({ length: count }, (_, index) => ({
    headerBytes: encodeFrameHeader({ frameType: 3, flags: 0, sequence: BigInt(index), ciphertextBytes: 512 * 1024 }),
    ciphertext: new Uint8Array(512 * 1024).fill(index + 1)
  }));
  const expected: Uint8Array[] = [];
  for await (const chunk of encodeFramedSyncStream({ preamble, frames: (async function* () { yield* frames; })() })) expected.push(chunk);
  const exact = Buffer.concat(expected);
  const body = await prepareDesktopRequestSyncBody({ preamble, frames: (async function* () { yield* frames; })() });
  try {
    frames.forEach(frame => frame.ciphertext.fill(0));
    const actual: Uint8Array[] = [];
    for await (const chunk of encodeFramedSyncHttpBody(body)) actual.push(Uint8Array.from(chunk));
    expect(body.contentLength).toBe(exact.length);
    expect(body.bodySha256).toBe(createHash('sha256').update(exact).digest('hex'));
    expect(createHash('sha256').update(Buffer.concat(actual)).digest('hex')).toBe(body.bodySha256);
    expect(spoolDesktopFramedSyncBody).toHaveBeenCalledTimes(exact.length > REQUEST_SYNC_MEMORY_BYTES ? 1 : 0);
  } finally { await body.dispose?.(); }
});

it.each([1, 10])('releases a prepared body when its HTTP consumer stops early (%i frames)', async count => {
  vi.mocked(spoolDesktopFramedSyncBody).mockClear();
  const preamble = encodeFramedSyncPreamble({ compression: 'none', contextKind: 'session',
    contextId: new Uint8Array(32), noncePrefix: new Uint8Array(4), sessionId: new Uint8Array(16), startingSequence: 0n });
  let producerClosed = false;
  const body = await prepareDesktopRequestSyncBody({ preamble, frames: (async function* () {
    try {
      for (let index = 0; index < count; index++) yield {
        headerBytes: encodeFrameHeader({ frameType: 3, flags: 0, sequence: BigInt(index), ciphertextBytes: 512 * 1024 }),
        ciphertext: new Uint8Array(512 * 1024).fill(index + 1)
      };
    } finally { producerClosed = true; }
  })() });
  const iterator = encodeFramedSyncHttpBody(body)[Symbol.asyncIterator]();
  try {
    expect(producerClosed).toBe(true);
    expect((await iterator.next()).done).toBe(false);
    await iterator.return?.();
    const spilled = body.contentLength > REQUEST_SYNC_MEMORY_BYTES;
    expect(spoolDesktopFramedSyncBody).toHaveBeenCalledTimes(spilled ? 1 : 0);
    const remaining = body.frames[Symbol.asyncIterator]();
    if (spilled) {
      expect(() => retainDesktopFramedSyncSealedBody(body)).toThrow('framed_sync_sealed_body_released');
      await expect(remaining.next()).rejects.toMatchObject({ code: 'ENOENT' });
    } else {
      expect(await remaining.next()).toEqual({ done: true, value: undefined });
    }
  } finally { await iterator.return?.(); await body.dispose?.(); }
});
