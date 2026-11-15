// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { authorizeSelectedImportDirectoryPath, resetImportPathAuthorizationForTests } from './importPathAuthorization.js';
import { readSuperMemoSource } from './readSuperMemoSource.js';

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

it('reads only the prepared export in a selected folder', async () => {
  const folder = await createFolder();
  await writeFile(path.join(folder, 'Other.xml'), 'another export');
  await expect(readSuperMemoSource(folder)).rejects.toThrow();
  await authorizeSelectedImportDirectoryPath(folder);
  await expect(readSuperMemoSource(folder)).resolves.toEqual({ status: 'missing-xml' });
  await writeFile(path.join(folder, 'SuperMemo.xml'), 'export');
  await expect(readSuperMemoSource(folder)).resolves.toMatchObject({ status: 'ready', xml: 'export', collectionDirectory: undefined });
  await mkdir(path.join(folder, 'info'));
  await expect(readSuperMemoSource(folder)).resolves.toMatchObject({ status: 'ready', collectionDirectory: expect.any(String) });
});

it('rejects an export that points outside the folder selected by the user', async () => {
  const folder = await createFolder();
  const otherFolder = await createFolder();
  const outside = path.join(otherFolder, 'export.xml');
  await writeFile(outside, 'outside');
  await symlink(outside, path.join(folder, 'SuperMemo.xml'));
  await authorizeSelectedImportDirectoryPath(folder);
  await expect(readSuperMemoSource(folder)).rejects.toThrow('invalid_supermemo_xml_path');
});
