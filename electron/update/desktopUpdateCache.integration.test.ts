import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const payload = 'isolated update payload';
const sha512 = createHash('sha512').update(payload).digest('base64');
const fileInfo = { url: new URL('https://example.invalid/update.zip'), info: { url: 'update.zip', sha512 } };
const updateInfo = {
  version: '0.7.17', releaseDate: '2026-10-28', files: [fileInfo.info], path: 'update.zip', sha512
};
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let cacheRoot: string;
let pending: string;

beforeEach(async () => {
  const artifacts = path.resolve('.tmp/artifacts/T554');
  await mkdir(artifacts, { recursive: true });
  cacheRoot = await mkdtemp(path.join(artifacts, 'update-cache-'));
  pending = path.join(cacheRoot, 'pending');
  await mkdir(pending);
});

afterEach(async () => {
  await rm(cacheRoot, { recursive: true, force: true });
});

it.each([undefined, '', '../outside.zip', 'nested/update.zip'])(
  'discards malformed cached update filename %s without touching outside files',
  async (fileName) => {
    const outsideFile = path.join(cacheRoot, 'outside.zip');
    await writeFile(outsideFile, payload);
    await writeFile(path.join(pending, 'update-info.json'), JSON.stringify({ fileName, sha512 }));
    const helper = new DownloadedUpdateHelper(cacheRoot);

    await expect(helper.validateDownloadedPath(
      path.join(pending, 'update.zip'), updateInfo, fileInfo, logger
    )).resolves.toBeNull();
    expect(await readdir(pending)).toEqual([]);
    expect(await readFile(outsideFile, 'utf8')).toBe(payload);
  }
);

it('reuses a valid cached update after a new helper instance verifies its checksum', async () => {
  const updateFile = path.join(pending, 'update.zip');
  await writeFile(updateFile, payload);
  await writeFile(path.join(pending, 'update-info.json'), JSON.stringify({ fileName: 'update.zip', sha512 }));
  const helper = new DownloadedUpdateHelper(cacheRoot);

  await expect(helper.validateDownloadedPath(updateFile, updateInfo, fileInfo, logger)).resolves.toBe(updateFile);
  expect(await readFile(updateFile, 'utf8')).toBe(payload);
});
