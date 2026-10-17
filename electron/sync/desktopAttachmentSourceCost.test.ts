// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as files from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { createDesktopAttachmentBlockSource } from './desktopAttachmentBlockSource.js';

async function sourceFixture() {
  const root = await fs.mkdtemp(path.resolve('.tmp/artifacts/attachment-cost-'));
  const bytes = Buffer.alloc(8 * BLOCK, 41), key = `${createHash('sha256').update(bytes).digest('hex')}.pdf`;
  await fs.writeFile(path.join(root, key), bytes);
  let readBytes = 0;
  const open = fs.open.bind(fs);
  const trackedOpen: typeof fs.open = async (...args) => {
    const handle = await open(...args);
    const read = handle.read.bind(handle);
    handle.read = (async (...input: Parameters<typeof read>) => {
      const result = await read(...input);
      readBytes += result.bytesRead;
      return result;
    }) as typeof handle.read;
    return handle;
  };
  const spy = vi.spyOn(fs, 'open').mockImplementation(trackedOpen);
  vi.mocked(files.open).mockImplementation(trackedOpen);
  return { root, bytes, key, reads: () => readBytes,
    source: () => createDesktopAttachmentBlockSource(root, `${root}/library.sqlite`),
    async close() { spy.mockRestore(); vi.mocked(files.open).mockReset(); await fs.rm(root, { recursive: true, force: true }); } };
}

it('sends eight requested blocks with no more than one additional complete source read', async () => {
  const fixture = await sourceFixture();
  try {
    for (let offset = 0; offset < fixture.bytes.length; offset += BLOCK) {
      await fixture.source().withFile(fixture.key, async file => {
        expect(Buffer.from(await file.read(offset, BLOCK))).toEqual(fixture.bytes.subarray(offset, offset + BLOCK));
      });
    }
    expect(fixture.reads()).toBeLessThanOrEqual(2 * fixture.bytes.length);
  } finally { await fixture.close(); }
});

it('does not expose an unverified file and stops initial verification at the next requested boundary', async () => {
  const fixture = await sourceFixture();
  let consumed = false;
  try {
    await fixture.source().withFile(fixture.key, async () => { consumed = true; }, { shouldYield: () => true })
      .catch(error => { expect(String(error)).toContain('attachment_verification_pending'); });
    expect(consumed).toBe(false);
    expect(fixture.reads()).toBeLessThanOrEqual(BLOCK);
    await fixture.source().withFile(fixture.key, async () => { consumed = true; });
    expect(consumed).toBe(true);
    expect(fixture.reads()).toBe(fixture.bytes.length);
  } finally { await fixture.close(); }
});
