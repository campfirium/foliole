// @vitest-environment node
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { withAttachmentFileLease } from './attachmentFileLease.js';
import { setAttachmentPublishedListener } from './attachmentPublishedEvents.js';
import { moveAttachmentToTrash } from './attachmentTrashFiles.js';
import { publishImmutableAttachment } from './publishImmutableAttachment.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, link: vi.fn(actual.link), rename: vi.fn(actual.rename) };
});
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

it('keeps a new canonical path absent until all bytes have been verified and preserves an existing inode', async () => {
  await mkdir(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/immutable-attachment-'));
  vi.spyOn(fs, 'link').mockRejectedValue(Object.assign(new Error('Unsupported'), { code: 'ENOTSUP' }));
  const bytes = Buffer.from('complete attachment');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const destination = path.join(root, `${hash}.pdf`);
  try {
    expect(await publishImmutableAttachment(destination, hash, async temporary => {
      await writeFile(temporary, bytes.subarray(0, 4));
      await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
      await writeFile(temporary, bytes);
    })).toBe(true);
    const inode = (await stat(destination)).ino;
    expect(await publishImmutableAttachment(destination, hash, temporary => writeFile(temporary, bytes))).toBe(false);
    expect((await stat(destination)).ino).toBe(inode);
    await expect(publishImmutableAttachment(path.join(root, 'not-yet-published.pdf'), hash, temporary => writeFile(temporary, 'changed source')))
      .rejects.toThrow('canonical_attachment_hash_mismatch');
    expect(await readFile(destination)).toEqual(bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('keeps collection from moving a file during its send lease and permits it after release', async () => {
  await mkdir(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-send-gc-'));
  const key = `${'a'.repeat(64)}.pdf`;
  try {
    await writeFile(path.join(root, key), 'bytes');
    await withAttachmentFileLease(path.join(root, key), async () => {
      expect(() => moveAttachmentToTrash(root, key)).toThrow('attachment_send_busy');
      expect(await readFile(path.join(root, key), 'utf8')).toBe('bytes');
    });
    moveAttachmentToTrash(root, key);
    expect(await readFile(path.join(`${root}.trash`, key), 'utf8')).toBe('bytes');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(`${root}.trash`, { recursive: true, force: true });
  }
});

it.each(['EEXIST', 'EPERM'])('checks a competing destination after rename returns %s', async code => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-rename-'));
  const bytes = Buffer.from('verified content');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const destination = path.join(root, `${hash}.pdf`);
  const rename = vi.spyOn(fs, 'rename').mockImplementation(async () => {
    throw Object.assign(new Error('Destination occupied'), { code });
  });
  try {
    expect(await publishImmutableAttachment(destination, hash, async temporary => {
      await writeFile(temporary, bytes);
      await writeFile(destination, bytes);
    })).toBe(false);
    expect(rename).toHaveBeenCalledOnce();
    await rm(destination);
    await expect(publishImmutableAttachment(destination, hash, async temporary => {
      await writeFile(temporary, bytes);
      await writeFile(destination, 'corrupt competing content');
    })).rejects.toThrow('canonical_attachment_hash_mismatch');
    expect(await readFile(destination, 'utf8')).toBe('corrupt competing content');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('announces a storage key only when its verified bytes become newly visible', async () => {
  await mkdir(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-published-'));
  const bytes = Buffer.from('announced attachment');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const published = vi.fn();
  setAttachmentPublishedListener(published);
  try {
    await expect(publishImmutableAttachment(path.join(root, `${hash}.pdf`), hash, temporary => writeFile(temporary, 'wrong')))
      .rejects.toThrow('canonical_attachment_hash_mismatch');
    expect(published).not.toHaveBeenCalled();
    await publishImmutableAttachment(path.join(root, `${hash}.pdf`), hash, temporary => writeFile(temporary, bytes));
    await publishImmutableAttachment(path.join(root, `${hash}.pdf`), hash, temporary => writeFile(temporary, bytes));
    expect(published.mock.calls).toEqual([[`${hash}.pdf`]]);
  } finally {
    setAttachmentPublishedListener(null);
    await rm(root, { recursive: true, force: true });
  }
});
