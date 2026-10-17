// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { moveAttachmentToTrash, restoreAttachmentFromTrash } from '../attachments/attachmentTrashFiles.js';
import { publishImmutableAttachment } from '../attachments/publishImmutableAttachment.js';

import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';

it('checks presence in assets and trash without hashing, but verifies bytes before sending', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-presence-'));
  const key = `${'a'.repeat(64)}.pdf`;
  try {
    expect(await isDesktopAttachmentPresent(root, key)).toBe(false);
    await writeFile(path.join(root, key), 'content deliberately differs from its address');
    expect(await isDesktopAttachmentPresent(root, key)).toBe(true);
    await expect(createDesktopAttachmentBlockSource(root, root).withFile(key, async () => {}))
      .rejects.toThrow('attachment_source_invalid');
    await rm(path.join(root, key));
    await mkdir(`${root}.trash`);
    await writeFile(path.join(`${root}.trash`, key), 'still present');
    expect(await isDesktopAttachmentPresent(root, key)).toBe(true);
    await expect(isDesktopAttachmentPresent(root, '../escape.pdf')).rejects.toThrow('attachment_storage_key_invalid');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(`${root}.trash`, { recursive: true, force: true });
  }
});

it.each(['delete', 'restore', 'reimport'] as const)('invalidates a send proof after %s', async operation => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-proof-'));
  const bytes = Buffer.alloc(1024, 37);
  const hash = createHash('sha256').update(bytes).digest('hex'), key = `${hash}.pdf`;
  const file = path.join(root, key), source = createDesktopAttachmentBlockSource(root, `${root}/library.sqlite`);
  try {
    await writeFile(file, bytes);
    await source.withFile(key, async () => {});
    if (operation === 'reimport') await publishImmutableAttachment(file, hash, async temporary => { await writeFile(temporary, bytes); });
    else {
      moveAttachmentToTrash(root, key);
      if (operation === 'restore') {
        await source.withFile(key, async () => {});
        restoreAttachmentFromTrash(root, key);
      }
    }
    await writeFile(operation === 'delete' ? path.join(`${root}.trash`, key) : file, Buffer.alloc(bytes.length, 99));
    let opened = false;
    await expect(source.withFile(key, async () => { opened = true; })).rejects.toThrow('attachment_source_invalid');
    expect(opened).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(`${root}.trash`, { recursive: true, force: true });
  }
});

it('rejects replacement and truncation of an already verified path before returning bytes', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-proof-'));
  const bytes = Buffer.alloc(1024, 37), key = `${createHash('sha256').update(bytes).digest('hex')}.pdf`;
  const file = path.join(root, key), source = createDesktopAttachmentBlockSource(root, `${root}/library.sqlite`);
  try {
    for (const size of [bytes.length, 3]) {
      await writeFile(file, bytes);
      await source.withFile(key, async input => { expect(await input.read(0, bytes.length)).toEqual(new Uint8Array(bytes)); });
      await writeFile(`${file}.replacement`, Buffer.alloc(size, 99));
      await rename(`${file}.replacement`, file);
      await expect(source.withFile(key, input => input.read(0, size))).rejects.toThrow('attachment_source_invalid');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
