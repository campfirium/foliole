import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { classifyResourceFailure } from '../../lib/platform/resourceAvailabilityContract.js';

import { checkpointForTest, receiveAttachmentForTest as receiveDesktopAttachmentRanges } from './attachmentCheckpoint.testSupport.js';
import { ATTACHMENT_RANGE_BYTES } from './companionLanAttachmentResources.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) =>
  fs.rm(root, { recursive: true, force: true }))));

it('recovers a published attachment without contacting an unavailable source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-published-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment');
  const source = Buffer.alloc(ATTACHMENT_RANGE_BYTES + 17, 0x51);
  const contentHash = createHash('sha256').update(source).digest('hex');
  await fs.writeFile(filePath, source);
  const requestRange = vi.fn(async () => { throw new Error('source offline'); });
  await receiveDesktopAttachmentRanges({ filePath, contentHash,
    expectedBytes: source.length, requestRange });
  expect(requestRange).not.toHaveBeenCalled();
  expect(await fs.readFile(filePath)).toEqual(source);
});

it('does not accept an existing published file with the wrong identity', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-published-bad-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment');
  const source = Buffer.from('correct attachment');
  const contentHash = createHash('sha256').update(source).digest('hex');
  await fs.writeFile(filePath, Buffer.alloc(source.length, 0x52));
  const requestRange = vi.fn(async () => ({ body: source, totalBytes: source.length }));
  await receiveDesktopAttachmentRanges({ filePath, contentHash,
    expectedBytes: source.length, requestRange });
  expect(requestRange).toHaveBeenCalledWith(0);
  expect(await fs.readFile(filePath)).toEqual(source);
});

it('resumes confirmed attachment bytes after interruption and verifies before publication', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-resume-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment');
  const source = Buffer.alloc(ATTACHMENT_RANGE_BYTES * 3 + 17, 0x51);
  const contentHash = createHash('sha256').update(source).digest('hex');
  const offsets: number[] = [];
  let interrupted = false;
  const requestRange = async (offset: number) => {
    offsets.push(offset);
    if (offset === ATTACHMENT_RANGE_BYTES * 2 && !interrupted) {
      interrupted = true;
      throw new Error('network disconnected');
    }
    return { body: source.subarray(offset, offset + ATTACHMENT_RANGE_BYTES),
      totalBytes: source.length };
  };
  const args = { filePath, contentHash, expectedBytes: source.length, requestRange };
  await expect(receiveDesktopAttachmentRanges(args)).rejects.toThrow('network disconnected');
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await fs.stat(`${filePath}.unverified`)).size).toBe(ATTACHMENT_RANGE_BYTES * 2);
  offsets.length = 0;
  await receiveDesktopAttachmentRanges(args);
  expect(offsets).toEqual([0, ATTACHMENT_RANGE_BYTES * 2, ATTACHMENT_RANGE_BYTES * 3]);
  expect(await fs.readFile(filePath)).toEqual(source);
  await expect(fs.stat(`${filePath}.unverified`)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects changed source bytes and restarts from a safe prefix', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-source-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment');
  const source = Buffer.alloc(ATTACHMENT_RANGE_BYTES + 7, 0x61);
  const contentHash = createHash('sha256').update(source).digest('hex');
  await fs.writeFile(`${filePath}.unverified`, Buffer.alloc(ATTACHMENT_RANGE_BYTES, 0x62));
  const offsets: number[] = [];
  await receiveDesktopAttachmentRanges({ filePath, contentHash,
    requestRange: async (offset) => {
      offsets.push(offset);
      return { body: source.subarray(offset, offset + ATTACHMENT_RANGE_BYTES),
        totalBytes: source.length };
    } });
  expect(offsets).toEqual([0, ATTACHMENT_RANGE_BYTES]);
  expect(await fs.readFile(filePath)).toEqual(source);
});

it('discards an unconfirmed tail and resumes at the last complete segment', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-tail-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment');
  const source = Buffer.alloc(ATTACHMENT_RANGE_BYTES * 2 + 7, 0x63);
  const contentHash = createHash('sha256').update(source).digest('hex');
  await fs.writeFile(`${filePath}.unverified`, source.subarray(0, ATTACHMENT_RANGE_BYTES + 13));
  await checkpointForTest(filePath, contentHash).save(source.length, ATTACHMENT_RANGE_BYTES);
  const offsets: number[] = [];
  await receiveDesktopAttachmentRanges({ filePath, contentHash,
    requestRange: async (offset) => {
      offsets.push(offset);
      return { body: source.subarray(offset, offset + ATTACHMENT_RANGE_BYTES),
        totalBytes: source.length };
    } });
  expect(offsets).toEqual([0, ATTACHMENT_RANGE_BYTES, ATTACHMENT_RANGE_BYTES * 2]);
  expect(await fs.readFile(filePath)).toEqual(source);
});

it('never publishes a segment with an incorrect final hash', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-corrupt-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment');
  const source = Buffer.alloc(ATTACHMENT_RANGE_BYTES + 7, 0x64);
  const contentHash = createHash('sha256').update(source).digest('hex');
  await expect(receiveDesktopAttachmentRanges({ filePath, contentHash,
    requestRange: async (offset) => ({
      body: offset === 0 ? source.subarray(0, ATTACHMENT_RANGE_BYTES) : Buffer.alloc(7, 0x65),
      totalBytes: source.length
    }) })).rejects.toThrow('attachment_checksum_mismatch');
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.stat(`${filePath}.unverified`)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps a confirmed prefix after a disk write runs out of space and resumes it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-full-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment');
  const source = Buffer.alloc(ATTACHMENT_RANGE_BYTES * 2 + 7, 0x65);
  const contentHash = createHash('sha256').update(source).digest('hex');
  const offsets: number[] = [];
  const args = { filePath, contentHash, requestRange: async (offset: number) => {
    offsets.push(offset);
    return { body: source.subarray(offset, offset + ATTACHMENT_RANGE_BYTES),
      totalBytes: source.length };
  } };
  const open = fs.open.bind(fs);
  const spy = vi.spyOn(fs, 'open').mockImplementation(async (...parameters) => {
    const handle = await open(...parameters);
    if (String(parameters[0]).endsWith('.unverified')) {
      const write = handle.write.bind(handle);
      handle.write = (async (buffer: Buffer, offset: number, length: number, position: number) => {
        if (position === ATTACHMENT_RANGE_BYTES) {
          throw Object.assign(new Error('write failed'), { code: 'ENOSPC' });
        }
        return write(buffer, offset, length, position);
      }) as typeof handle.write;
    }
    return handle;
  });
  try {
    await expect(receiveDesktopAttachmentRanges(args)).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(classifyResourceFailure(Object.assign(new Error('write failed'), { code: 'ENOSPC' })))
      .toBe('disk_full');
  } finally { spy.mockRestore(); }
  expect((await fs.stat(`${filePath}.unverified`)).size).toBe(ATTACHMENT_RANGE_BYTES);
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  offsets.length = 0;
  await receiveDesktopAttachmentRanges(args);
  expect(offsets).toEqual([0, ATTACHMENT_RANGE_BYTES, ATTACHMENT_RANGE_BYTES * 2]);
  expect(await fs.readFile(filePath)).toEqual(source);
});
