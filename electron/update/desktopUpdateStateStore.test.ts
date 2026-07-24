import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { createDesktopUpdateStateStore } from './desktopUpdateStateStore.js';

let tempRoot = '';
let filePath = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-update-state-'));
  filePath = path.join(tempRoot, 'desktop-update-state-v1.json');
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('atomically writes and reads a versioned recovery record', async () => {
  const store = createDesktopUpdateStateStore(filePath);
  const record = {
    checkpoint: 'downloaded' as const,
    installedVersion: '0.6.0',
    schemaVersion: 1 as const,
    targetVersion: '0.7.0'
  };

  await store.write(record);

  await expect(store.read()).resolves.toEqual(record);
  await expect(fs.readdir(tempRoot)).resolves.toEqual(['desktop-update-state-v1.json']);
});

it('removes malformed and unsupported records instead of restoring them', async () => {
  const store = createDesktopUpdateStateStore(filePath);
  await fs.writeFile(filePath, JSON.stringify({ schemaVersion: 2, targetVersion: '0.7.0' }));

  await expect(store.read()).resolves.toBeNull();
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });

  await fs.writeFile(filePath, '{broken');
  await expect(store.read()).resolves.toBeNull();
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
});
