// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';

it('refuses paths outside the transport root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-transport-files-'));
  try {
    const files = createDesktopFramedSyncFiles(root);
    await expect(files.read('../foliole.db')).rejects.toThrow('framed_sync_file_key_invalid');
  } finally { await rm(root, { recursive: true, force: true }); }
});
