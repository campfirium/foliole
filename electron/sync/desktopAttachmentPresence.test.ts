// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';

it('checks presence in assets and trash without hashing, but verifies bytes before sending', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-presence-'));
  const key = `${'a'.repeat(64)}.pdf`;
  try {
    expect(await isDesktopAttachmentPresent(root, key)).toBe(false);
    await writeFile(path.join(root, key), 'content deliberately differs from its address');
    expect(await isDesktopAttachmentPresent(root, key)).toBe(true);
    await expect(createDesktopAttachmentBlockSource(root).withFile(key, async () => {}))
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
