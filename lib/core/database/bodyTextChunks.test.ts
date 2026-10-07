// @vitest-environment node
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import { alignedBodyTextChunks, utf8BodyTextChunks } from './bodyTextChunks.js';
import { hashTextBodyWithLength } from './textBodyHash.js';

it.each([
  '', '\ufeff\r\n中文😀\u0000', '\ud800x\udc00',
  'x'.repeat(16 * 1024 - 1) + '😀' + 'x'.repeat(BODY_CONTENT_CHUNK_BYTES),
  '中😀'.repeat(Math.floor(3 * 1024 * 1024 / 7)) + 'abcde'
])('encodes aligned body chunks with the exact original UTF-8 hash and byte count', async (content) => {
  const expected = new TextEncoder().encode(content);
  expect(hashTextBodyWithLength(content)).toEqual({ hash: bytesToHex(sha256(expected)), byteLength: expected.byteLength });
  const decoded = new Uint8Array(expected.byteLength);
  let offset = 0;
  for await (const chunk of alignedBodyTextChunks(content, expected.byteLength)) {
    expect(chunk.byteLength).toBe(Math.min(BODY_CONTENT_CHUNK_BYTES, expected.byteLength - offset));
    decoded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  expect(decoded).toEqual(expected);
  expect(offset).toBe(expected.byteLength);
  for (const bytes of utf8BodyTextChunks(content)) expect(bytes.byteLength).toBeLessThanOrEqual(64 * 1024);
});

it.each([0, 2, 4])('rejects a declared byte length %s that differs from the text', async (size) => {
  async function drain() { for await (const bytes of alignedBodyTextChunks('abc', size)) void bytes; }
  await expect(drain()).rejects.toThrow('body_text_length_mismatch');
});
