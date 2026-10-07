// @vitest-environment node

import { createHash } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { withVerifiedFramedHttpBody } from './desktopFramedSyncHttpBody.js';

async function* fixtureBytes(size: number) {
  let seed = 0x13579bdf;
  for (let offset = 0; offset < size; offset += 64 * 1024) {
    const chunk = Buffer.alloc(Math.min(64 * 1024, size - offset));
    for (let index = 0; index < chunk.length; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      chunk[index] = seed & 255;
    }
    yield chunk;
  }
}

async function fixtureHash(size: number) {
  const digest = createHash('sha256');
  for await (const chunk of fixtureBytes(size)) digest.update(chunk);
  return digest.digest('hex');
}

it('authenticates a deterministic 50 MiB HTTP body on disk and reads bounded bytes', async () => {
  const size = 50 * 1024 * 1024;
  const hash = await fixtureHash(size);
  let path = '';
  await withVerifiedFramedHttpBody({ body: fixtureBytes(size), expectedSha256: hash, contentLength: String(size) }, async (stream) => {
    path = String(stream.path);
    expect((await stat(path)).size).toBe(size);
    const digest = createHash('sha256');
    let total = 0;
    let tail = 0;
    for await (const bytes of stream) {
      expect(bytes.byteLength).toBeLessThanOrEqual(64 * 1024);
      total += bytes.byteLength;
      digest.update(bytes);
      tail = bytes[bytes.byteLength - 1];
    }
    let expectedTail = 0;
    for await (const bytes of fixtureBytes(size)) expectedTail = bytes[bytes.byteLength - 1]!;
    expect(total).toBe(size);
    expect(tail).toBe(expectedTail);
    expect(digest.digest('hex')).toBe(hash);
  });
  await expect(access(dirname(path))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each([
  ['mismatched digest', '0'.repeat(64), '3', 'invalid_signature'],
  ['truncated length', createHash('sha256').update('abc').digest('hex'), '4', 'truncated_http_body'],
  ['excess bytes', createHash('sha256').update('abc').digest('hex'), '2', 'http_body_length_exceeded'],
  ['invalid length', createHash('sha256').update('abc').digest('hex'), '-1', 'invalid_http_body_length']
])('rejects %s before making the file readable', async (_name, expectedSha256, contentLength, error) => {
  const consume = vi.fn();
  await expect(withVerifiedFramedHttpBody({ body: Readable.from([Buffer.from('abc')]), expectedSha256, contentLength }, consume))
    .rejects.toThrow(error);
  expect(consume).not.toHaveBeenCalled();
});

it('cleans a request file after decoding fails or the consumer does not drain it', async () => {
  const expectedSha256 = createHash('sha256').update('abc').digest('hex');
  let path = '';
  for (const fails of [true, false]) {
    const result = withVerifiedFramedHttpBody({ body: Readable.from([Buffer.from('abc')]), expectedSha256 }, async (stream) => {
      path = String(stream.path);
      expect((await stat(path)).size).toBe(3);
      if (fails) throw new Error('decode_failed');
      return 1;
    });
    if (fails) await expect(result).rejects.toThrow('decode_failed');
    else await expect(result).resolves.toBe(1);
    await expect(access(dirname(path))).rejects.toMatchObject({ code: 'ENOENT' });
  }
});
