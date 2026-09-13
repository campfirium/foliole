// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-compressed-backup-tests';
const trashItem = vi.hoisted(() => vi.fn());

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./backupFileDisposition.js', () => ({ moveManagedBackupToTrash: trashItem }));

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  trashItem.mockReset().mockImplementation(async (filePath: string) => {
    const { rm } = await import('node:fs/promises');
    await rm(filePath, { force: true });
  });
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-compressed-backup-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('creates an independent gzip backup and restores it through the existing sqlite path', async () => {
  seedNode('# original');
  const backup = await createApplicationDatabaseBackup();

  expect(backup.destinationPath).toMatch(/\.db\.gz$/);
  expect([...await readPrefix(backup.destinationPath)]).toEqual([0x1f, 0x8b]);

  seedNode('# changed');
  const restored = await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  expect(restored.sourcePath).toBe(path.resolve(backup.destinationPath));
  expect(currentContent()).toBe('# original');
  await expect(fs.access(backup.destinationPath)).resolves.toBeUndefined();
  await expectNoRestoreSources(path.dirname(mockedAppDataDir));
});

it('keeps the current database available when a compressed backup is truncated', async () => {
  seedNode('# original');
  const backup = await createApplicationDatabaseBackup();
  seedNode('# current');
  await fs.truncate(backup.destinationPath, 12);

  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath }))
    .rejects.toThrow('Your current library is unchanged');

  expect(currentContent()).toBe('# current');
  expect(trashItem).not.toHaveBeenCalled();
  expect((await fs.readdir(path.dirname(backup.destinationPath)))
    .some((fileName) => fileName.startsWith('pre-restore-'))).toBe(false);
  await expectNoRestoreSources(path.dirname(mockedAppDataDir));
});

it('continues to restore explicitly exported legacy sqlite files', async () => {
  seedNode('# original');
  const destinationPath = path.join(tempRoot, 'legacy-export.db');
  const backup = await createApplicationDatabaseBackup({ destinationPath });
  seedNode('# current');

  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  expect(backup.destinationPath).toBe(destinationPath);
  expect(currentContent()).toBe('# original');
});

it('restores the current library when database replacement fails', async () => {
  seedNode('# original');
  const backup = await createApplicationDatabaseBackup();
  seedNode('# current');
  const originalRename = fs.rename.bind(fs);
  let renameCount = 0;
  let targetExistedBeforeCommit = false;
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, targetPath) => {
    renameCount += 1;
    if (renameCount === 1) {
      targetExistedBeforeCommit = await fs.access(targetPath).then(() => true, () => false);
      throw new Error('injected replacement failure');
    }
    await originalRename(sourcePath, targetPath);
  });

  try {
    await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath }))
      .rejects.toThrow('Your current library has been restored');
    expect(currentContent()).toBe('# current');
    expect(targetExistedBeforeCommit).toBe(true);
    expect(trashItem).toHaveBeenCalledWith(expect.stringContaining('pre-restore-'));
  } finally {
    renameSpy.mockRestore();
  }
});

async function readPrefix(filePath: string) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(2);
    await handle.read(buffer, 0, buffer.length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

async function expectNoRestoreSources(directoryPath: string) {
  const entries = await fs.readdir(directoryPath, { recursive: true });
  expect(entries.some((entry) => entry.includes('.foliole-restore-source-'))).toBe(false);
}

function currentContent() {
  return loadWorkspaceSnapshot({ includeBody: true })?.nodesById['node-1']?.content;
}

function seedNode(content: string) {
  upsertNodeSnapshot({
    nodeId: 'node-1', parentNodeId: null, kind: 'topic', title: 'node-1', isTitleManual: true,
    content, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-03-14T10:00:00.000Z', updatedAt: new Date().toISOString()
  });
}
