import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from './attachmentBlockReceiver.js';
import { AttachmentSourceVerification, AttachmentVerificationPending } from './attachmentSourceVerification.js';

function fixture(size = BLOCK * 3 + 17) {
  let bytes: Uint8Array = new Uint8Array(size).fill(37);
  let readBytes = 0;
  const resource = { storageKey: `${bytesToHex(sha256(bytes))}.pdf`, byteLength: bytes.length };
  const file = { resource, async read(offset: number, length: number) {
    const result = bytes.slice(offset, offset + length); readBytes += result.length; return result;
  } };
  return { file, get bytes() { return bytes; }, replace: (value: Uint8Array) => { bytes = value; }, reads: () => readBytes };
}

it('reads the entire file only on a miss, and checks actual bytes on each subsequent send', async () => {
  const source = fixture(), cache = new AttachmentSourceVerification();
  await cache.verify('library-a', source.file);
  expect(source.reads()).toBe(source.bytes.length);
  const verified = await cache.verify('library-a', source.file);
  expect(await verified.read(BLOCK, BLOCK)).toEqual(source.bytes.slice(BLOCK, BLOCK * 2));
  expect(source.reads()).toBe(source.bytes.length + BLOCK);
  source.bytes[BLOCK] = source.bytes[BLOCK]! ^ 1;
  await expect(verified.read(BLOCK, BLOCK)).rejects.toThrow('attachment_source_invalid');
});

it.each(['replace', 'truncate'] as const)('rejects %s after proof without trusting metadata', async change => {
  const source = fixture(), cache = new AttachmentSourceVerification();
  const verified = await cache.verify('library-a', source.file);
  source.replace(change === 'replace' ? new Uint8Array(source.bytes.length) : source.bytes.slice(0, 3));
  await expect(verified.read(0, BLOCK)).rejects.toThrow('attachment_source_invalid');
});

it('rejects a corrupted initial scan before exposing a file', async () => {
  const source = fixture(), cache = new AttachmentSourceVerification();
  source.bytes[0] = source.bytes[0]! ^ 1;
  await expect(cache.verify('library-a', source.file)).rejects.toThrow('attachment_source_invalid');
});

it('allows input during the first scan and resumes without re-reading its verified prefix', async () => {
  const source = fixture(BLOCK * 32), cache = new AttachmentSourceVerification();
  let editWaiting = false;
  const input = new Promise<void>(resolve => setTimeout(() => { editWaiting = true; resolve(); }, 0));
  await expect(cache.verify('library-a', source.file, () => editWaiting)).rejects.toBeInstanceOf(AttachmentVerificationPending);
  await input;
  expect(source.reads()).toBe(BLOCK);
  await cache.verify('library-a', source.file);
  expect(source.reads()).toBe(source.bytes.length);
});

it('isolates libraries, revalidates after invalidation, and evicts the least recently used proof', async () => {
  const source = fixture(BLOCK), cache = new AttachmentSourceVerification(2);
  await cache.verify('library-a', source.file);
  await cache.verify('library-b', source.file);
  expect(source.reads()).toBe(BLOCK * 2);
  await cache.verify('library-a', source.file);
  await cache.verify('library-c', source.file);
  await cache.verify('library-b', source.file);
  expect(source.reads()).toBe(BLOCK * 4);
  cache.invalidate(source.file.resource.storageKey);
  await cache.verify('library-b', source.file);
  expect(source.reads()).toBe(BLOCK * 5);
});

it('cannot publish a partial proof invalidated while its read is in flight', async () => {
  const source = fixture(), cache = new AttachmentSourceVerification();
  const file = { ...source.file, async read(offset: number, length: number) {
    cache.invalidate(source.file.resource.storageKey);
    return source.file.read(offset, length);
  } };
  await expect(cache.verify('library-a', file)).rejects.toBeInstanceOf(AttachmentVerificationPending);
  expect(source.reads()).toBe(BLOCK);
  await cache.verify('library-a', source.file);
  expect(source.reads()).toBe(BLOCK + source.bytes.length);
});
