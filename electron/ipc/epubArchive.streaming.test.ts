// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readEpubArchiveIndex } from './epubArchive.js';
import { extractEpubEntry } from './epubArchiveExtraction.js';
import { readRawEpubBookBytes } from './epubImportBook.js';
import { bookZip, forgeEntrySize } from './epubStreaming.testSupport.js';
import { createTestZip } from './testZipBuilder.js';

const disk = vi.hoisted(() => ({ available: undefined as number | undefined }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, statfs: async (...args: Parameters<typeof actual.statfs>) => {
    const result = await actual.statfs(...args);
    return disk.available === undefined ? result : { ...result, bsize: 1, bavail: disk.available };
  } };
});

let root = '';
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-stream-test-')); });
afterEach(async () => { disk.available = undefined; await fs.rm(root, { recursive: true, force: true }); });

it.each(['store', 'deflate'] as const)('stops forged %s output and removes the partial file', async (compression) => {
  const zip = createTestZip([{ name: 'payload', content: 'a'.repeat(64 * 1024), compression }]);
  forgeEntrySize(zip, 'payload', 1);
  const file = path.join(root, 'source.epub');
  const output = path.join(root, 'output');
  await fs.writeFile(file, zip);
  const index = await readEpubArchiveIndex(file);
  await expect(extractEpubEntry(file, index.get('payload')!, output)).rejects.toThrow('exceeds declared size');
  await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects undersized actual output and bad checksums', async () => {
  const zip = createTestZip([{ name: 'payload', content: 'hello', compression: 'deflate' }]);
  const file = path.join(root, 'source.epub');
  await fs.writeFile(file, zip);
  const entry = (await readEpubArchiveIndex(file)).get('payload')!;
  await expect(extractEpubEntry(file, { ...entry, size: 6 }, path.join(root, 'size'))).rejects.toThrow('checksum mismatch');
  await expect(extractEpubEntry(file, { ...entry, crc: 0 }, path.join(root, 'crc'))).rejects.toThrow('checksum mismatch');
});

it('checks payload ranges before extraction', async () => {
  const zip = createTestZip([{ name: 'payload', content: 'hello' }]);
  zip.writeUInt32LE(zip.length, zip.readUInt32LE(zip.length - 6) + 20);
  const file = path.join(root, 'source.epub');
  await fs.writeFile(file, zip);
  await expect(readEpubArchiveIndex(file)).rejects.toThrow('payload range');
});

it('extracts empty deflate and stored entries without truncation', async () => {
  const zip = createTestZip([{ name: 'a', content: '', compression: 'deflate' }, { name: 'b', content: '' }]);
  const file = path.join(root, 'source.epub');
  await fs.writeFile(file, zip);
  for (const [name, entry] of await readEpubArchiveIndex(file)) {
    const output = path.join(root, name);
    await extractEpubEntry(file, entry, output);
    expect((await fs.stat(output)).size).toBe(0);
  }
});

it('rejects a forged required chapter through the real parsing process', async () => {
  const zip = bookZip(`<html><body><p>${'a'.repeat(64 * 1024)}</p></body></html>`);
  forgeEntrySize(zip, 'OPS/chapter.xhtml', 1);
  await expect(readRawEpubBookBytes(zip, 'forged.epub')).rejects.toThrow('exceeds declared size');
});

it('does not expand unused payloads and cleans the working directory after consumption', async () => {
  const zip = bookZip('<html><body><h1>Chapter</h1><p>Readable body</p></body></html>', [
    { name: 'unused', content: 'a'.repeat(64 * 1024), compression: 'deflate' }
  ]);
  forgeEntrySize(zip, 'unused', 1);
  const book = await readRawEpubBookBytes(zip, 'normal.epub');
  const directory = book.workingDirectory!;
  try {
    expect(book.nodes[0]?.content).toContain('Readable body');
    await expect(fs.stat(path.join(directory, 'entry-4'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await book.dispose?.(); }
  await expect(fs.stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('accepts a highly compressible single chapter above the withdrawn 32 MiB limit', async () => {
  const zip = bookZip(`<html><body><h1>Large chapter</h1><p>${' '.repeat(33 * 1024 * 1024)}Readable body survives.</p></body></html>`);
  const book = await readRawEpubBookBytes(zip, 'large-chapter.epub');
  try {
    expect(book.nodes[0]?.content).toContain('Readable body survives.');
    expect(book.nodes[0]?.title).toBe('Large chapter');
  } finally { await book.dispose?.(); }
}, 60_000);

it('stops and removes partial output when the destination volume has insufficient free space', async () => {
  const zip = createTestZip([{ name: 'payload', content: 'a'.repeat(64 * 1024), compression: 'deflate' }]);
  const file = path.join(root, 'source.epub');
  const output = path.join(root, 'partial');
  await fs.writeFile(file, zip);
  const entry = (await readEpubArchiveIndex(file)).get('payload')!;
  disk.available = 64;
  await expect(extractEpubEntry(file, entry, output)).rejects.toThrow('insufficient temporary disk space');
  await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('cancels streaming extraction without leaving partial output', async () => {
  const zip = createTestZip([{ name: 'payload', content: 'hello' }]);
  const file = path.join(root, 'source.epub');
  const output = path.join(root, 'partial');
  await fs.writeFile(file, zip);
  const entry = (await readEpubArchiveIndex(file)).get('payload')!;
  await expect(extractEpubEntry(file, entry, output, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
  await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
});
