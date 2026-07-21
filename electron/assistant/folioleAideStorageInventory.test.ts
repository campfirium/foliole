// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { inventoryFolioleAideStorage } from './folioleAideStorageInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aide-storage-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reports an absent device root as empty and complete', async () => {
  await expect(inventoryFolioleAideStorage(path.join(tempRoot, 'missing'))).resolves.toEqual({
    bytes: 0,
    complete: true,
    issueCount: 0,
    path: path.join(tempRoot, 'missing')
  });
});

it('counts history sidecars and Codex files without following links', async () => {
  const root = path.join(tempRoot, 'Aide');
  const outside = path.join(tempRoot, 'outside.bin');
  await fs.mkdir(path.join(root, 'Codex', 'logs'), { recursive: true });
  await fs.writeFile(path.join(root, 'history.db'), 'history');
  await fs.writeFile(path.join(root, 'history.db-wal'), 'wal');
  await fs.writeFile(path.join(root, 'history.db-shm'), 'shm');
  await fs.writeFile(path.join(root, 'Codex', 'logs', 'codex.log'), 'log');
  await fs.writeFile(outside, 'x'.repeat(10_000));
  await fs.symlink(outside, path.join(root, 'outside-link'));

  const result = await inventoryFolioleAideStorage(root);
  const linkSize = (await fs.lstat(path.join(root, 'outside-link'))).size;

  expect(result).toEqual({
    bytes: 'history'.length + 'wal'.length + 'shm'.length + 'log'.length + linkSize,
    complete: true,
    issueCount: 0,
    path: root
  });
  expect(result.bytes).toBeLessThan(10_000);
});
