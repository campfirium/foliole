// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const { trashItem } = vi.hoisted(() => ({
  trashItem: vi.fn(async (filePath: string) => {
    await fs.rm(filePath, { force: true });
  })
}));

vi.mock('electron', () => ({
  shell: { trashItem }
}));

import {
  applyManagedInboxConsumePolicy,
  resolveDirectoryImportConsumePolicy,
  resolveDirectoryImportSourceAdapter,
  resolveManagedInboxPaths
} from './managedInboxFolder.js';

const tempRoots: string[] = [];

async function createTempRoot(prefix: string) {
  const parentDir = path.join(process.cwd(), '.tmp', 'tests');
  await fs.mkdir(parentDir, { recursive: true });
  const root = await fs.mkdtemp(path.join(parentDir, `${prefix}-`));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('resolves the managed inbox root under the runtime app data directory', () => {
  expect(resolveDirectoryImportSourceAdapter()).toBe('external_directory');
  expect(resolveDirectoryImportSourceAdapter('foliole_managed_inbox_folder')).toBe('foliole_managed_inbox_folder');
  expect(resolveDirectoryImportConsumePolicy('foliole_managed_inbox_folder')).toBe('clear');
  expect(resolveDirectoryImportConsumePolicy('foliole_managed_inbox_folder', 'archive')).toBe('archive');

  expect(resolveManagedInboxPaths('/tmp/foliole')).toEqual({
    archiveRootPath: path.join('/tmp/foliole', 'inbox-archive'),
    rootPath: path.join('/tmp/foliole', 'inbox')
  });
  expect(resolveManagedInboxPaths('/tmp/foliole', '/custom/inbox')).toEqual({
    archiveRootPath: path.join('/tmp/foliole', 'inbox-archive'),
    rootPath: '/custom/inbox'
  });
});

it('moves imported managed inbox files to trash while leaving failed sources behind', async () => {
  const appDataDir = await createTempRoot('managed-inbox-clear');
  const { archiveRootPath, rootPath } = resolveManagedInboxPaths(appDataDir);
  const importedPath = path.join(rootPath, 'nested', 'note.md');
  const failedPath = path.join(rootPath, 'failed.md');
  await fs.mkdir(path.dirname(importedPath), { recursive: true });
  await fs.writeFile(importedPath, '# Imported', 'utf8');
  await fs.writeFile(failedPath, '# Failed', 'utf8');

  const result = await applyManagedInboxConsumePolicy(
    [
      { result_status: 'imported', source_locator: importedPath },
      { result_status: 'failed', source_locator: failedPath }
    ],
    {
      archiveRootPath,
      importedAt: '2026-03-22T12:00:00.000Z',
      policy: 'clear',
      rootPath
    }
  );

  await expect(fs.stat(importedPath)).rejects.toThrow();
  await expect(fs.stat(path.join(rootPath, 'nested'))).rejects.toThrow();
  await expect(fs.readFile(failedPath, 'utf8')).resolves.toBe('# Failed');
  expect(trashItem).toHaveBeenCalledWith(importedPath);
  expect(result).toEqual({ archiveRootPath: null, consumedCount: 1 });
});

it('archives imported managed inbox files with preserved relative paths', async () => {
  const appDataDir = await createTempRoot('managed-inbox-archive');
  const { archiveRootPath, rootPath } = resolveManagedInboxPaths(appDataDir);
  const importedPath = path.join(rootPath, 'clips', 'note.md');
  const failedPath = path.join(rootPath, 'failed.md');
  await fs.mkdir(path.dirname(importedPath), { recursive: true });
  await fs.writeFile(importedPath, '# Imported', 'utf8');
  await fs.writeFile(failedPath, '# Failed', 'utf8');

  const result = await applyManagedInboxConsumePolicy(
    [
      { result_status: 'degraded', source_locator: importedPath },
      { result_status: 'failed', source_locator: failedPath }
    ],
    {
      archiveRootPath,
      importedAt: '2026-03-22T12:00:00.000Z',
      policy: 'archive',
      rootPath
    }
  );

  const archivedPath = path.join(archiveRootPath, '2026-03-22T12-00-00-000Z', 'clips', 'note.md');
  await expect(fs.readFile(archivedPath, 'utf8')).resolves.toBe('# Imported');
  await expect(fs.stat(importedPath)).rejects.toThrow();
  await expect(fs.readFile(failedPath, 'utf8')).resolves.toBe('# Failed');
  expect(result).toEqual({
    archiveRootPath: path.join(archiveRootPath, '2026-03-22T12-00-00-000Z'),
    consumedCount: 1
  });
});
