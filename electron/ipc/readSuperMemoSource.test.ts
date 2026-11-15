// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { authorizeSelectedImportFilePath, resetImportPathAuthorizationForTests } from './importPathAuthorization.js';
import { readSuperMemoSource } from './readSuperMemoSource.js';

vi.mock('electron', () => ({ dialog: {} }));

const folders: string[] = [];

async function createFolder() {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'foliole-supermemo-'));
  folders.push(folder);
  return folder;
}

afterEach(async () => {
  resetImportPathAuthorizationForTests();
  await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true })));
});

it('reads the chosen XML and detects the original folder without requiring a fixed filename', async () => {
  const folder = await createFolder();
  const xml = path.join(folder, 'Learning (all elements).xml');
  await writeFile(xml, 'export');
  await expect(readSuperMemoSource(xml)).rejects.toThrow();
  await authorizeSelectedImportFilePath(xml);
  await expect(readSuperMemoSource(xml)).resolves.toMatchObject({ xml: 'export', name: 'Learning (all elements).xml', collectionDirectory: undefined });
  await mkdir(path.join(folder, 'Learning', 'info'), { recursive: true });
  await expect(readSuperMemoSource(xml)).resolves.toMatchObject({ collectionDirectory: expect.stringMatching(/Learning$/u) });
  await mkdir(path.join(folder, 'info'));
  await expect(readSuperMemoSource(xml)).resolves.toMatchObject({ collectionDirectory: expect.not.stringMatching(/Learning$/u) });
});

it('ignores a matching collection name that points outside the export folder', async () => {
  const folder = await createFolder();
  const otherFolder = await createFolder();
  await mkdir(path.join(otherFolder, 'info'));
  const xml = path.join(folder, 'Learning.xml');
  await writeFile(xml, 'export');
  await symlink(otherFolder, path.join(folder, 'Learning'), 'junction');
  await authorizeSelectedImportFilePath(xml);
  await expect(readSuperMemoSource(xml)).resolves.toMatchObject({ collectionDirectory: undefined });
});
