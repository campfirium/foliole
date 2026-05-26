// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-restore-snapshot-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import {
  INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT,
  resolveInternalDatabaseSnapshotDirectory
} from './internalSnapshots.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-restore-snapshots-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('creates a pre-restore snapshot in Backups and prunes older snapshot files', async () => {
  seedNode('node-1', '# original');
  const manualBackup = await createApplicationDatabaseBackup();
  const connection = openDatabaseConnection();
  const snapshotDirectory = resolveInternalDatabaseSnapshotDirectory(connection.dbPath);
  await fs.writeFile(path.join(path.dirname(connection.dbPath), 'foliole-external.db'), 'external sidecar sentinel');

  await fs.mkdir(snapshotDirectory, { recursive: true });
  const staleSnapshotPaths: string[] = [];
  for (let index = 0; index < INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT; index += 1) {
    const snapshotPath = path.join(snapshotDirectory, `pre-restore-2026-03-14_10-0${index}-00-000.db`);
    staleSnapshotPaths.push(snapshotPath);
    await fs.writeFile(snapshotPath, `stale-${index}`);
    const mtime = new Date(Date.UTC(2026, 2, 14, 10, index, 0));
    await fs.utimes(snapshotPath, mtime, mtime);
  }

  seedNode('node-1', '# mutated');
  await restoreApplicationDatabaseBackup({ sourcePath: manualBackup.destinationPath });

  const snapshotNames = (await fs.readdir(snapshotDirectory))
    .filter((fileName) => fileName.startsWith('pre-restore-'))
    .sort();
  const backupDirectoryNames = await fs.readdir(snapshotDirectory);
  expect(snapshotNames).toHaveLength(INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT);
  expect(snapshotNames.some((fileName) => fileName.startsWith('pre-restore-'))).toBe(true);
  expect(backupDirectoryNames).not.toContain('foliole-external.db');
  expect(backupDirectoryNames).not.toContain(path.basename(connection.searchDbPath));
  await expect(fs.access(staleSnapshotPaths[0] as string)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps the current database untouched when the pre-restore snapshot cannot be created', async () => {
  seedNode('node-1', '# original');
  const manualBackup = await createApplicationDatabaseBackup();

  seedNode('node-1', '# current');
  const snapshotDirectory = resolveInternalDatabaseSnapshotDirectory(openDatabaseConnection().dbPath);
  await fs.rm(snapshotDirectory, { recursive: true, force: true });
  await fs.mkdir(path.dirname(snapshotDirectory), { recursive: true });
  await fs.writeFile(snapshotDirectory, 'blocked');

  await expect(restoreApplicationDatabaseBackup({ sourcePath: manualBackup.destinationPath })).rejects.toThrow(
    /failed to create pre-restore snapshot/
  );

  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
  if (snapshot === null) {
    throw new Error('workspace snapshot should remain available');
  }
  expect(snapshot.nodesById['node-1']).toMatchObject({ content: '# current' });
});

function seedNode(nodeId: string, content: string) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: nodeId,
    isTitleManual: true,
    content,
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z'
  });
}
