// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let mockedAppDataDir = '/tmp/foliole-backup-restore-snapshot-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
} from './backupRestore.js';
import { materializeCompressedSqliteBackup } from './compressedSqliteBackup.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import {
  INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT,
  resolveInternalDatabaseSnapshotDirectory
} from './internalSnapshots.js';
import { initializeDatabase } from './migrate.js';
import { DATABASE_SCHEMA_VERSION } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-restore-snapshots-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await removeTempRoot();
});

async function removeTempRoot() {
  try {
    await fs.rm(tempRoot, { recursive: true, force: true });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'EBUSY' && error.code !== 'EPERM')) {
      throw error;
    }
  }
}

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

it('restores through a complete sqlite safety snapshot when compression lacks space', async () => {
  seedNode('node-1', '# original');
  const sourcePath = path.join(tempRoot, 'legacy-source.db');
  await createApplicationDatabaseBackup({ destinationPath: sourcePath });
  seedNode('node-1', '# current');
  vi.spyOn(fs, 'statfs').mockResolvedValue({
    bavail: 0, bsize: 4096
  } as Awaited<ReturnType<typeof fs.statfs>>);

  await restoreApplicationDatabaseBackup({ sourcePath });

  expect(loadWorkspaceSnapshot({ includeBody: true })?.nodesById['node-1']?.content).toBe('# original');
  const snapshot = (await listApplicationDatabaseBackups()).find((entry) =>
    entry.snapshotReason === 'pre-restore');
  expect(snapshot?.fileName).toMatch(/^pre-restore-.*\.db$/);
  await expect(readSnapshotState(snapshot?.filePath)).resolves.toEqual({
    content: '# current', userVersion: DATABASE_SCHEMA_VERSION
  });
});

it('keeps distinct compressed pre-restore and pre-migration states restorable', async () => {
  seedNode('node-1', '# restored old state');
  const oldBackupPath = path.join(tempRoot, 'old-schema.db');
  await createApplicationDatabaseBackup({ destinationPath: oldBackupPath });
  const oldSqlite = new BetterSqlite3(oldBackupPath);
  oldSqlite.pragma(`user_version = ${DATABASE_SCHEMA_VERSION - 1}`);
  oldSqlite.close();
  seedNode('node-1', '# current state');

  await restoreApplicationDatabaseBackup({ sourcePath: oldBackupPath });

  const snapshots = (await listApplicationDatabaseBackups()).filter((entry) => entry.kind === 'snapshot');
  const preRestore = snapshots.find((entry) => entry.snapshotReason === 'pre-restore');
  const preMigration = snapshots.find((entry) => entry.snapshotReason === 'pre-migration');
  expect(preRestore?.fileName).toMatch(/^pre-restore-.*\.db\.gz$/);
  expect(preMigration?.fileName).toMatch(/^pre-migration-.*\.db\.gz$/);
  await expect(readSnapshotState(preRestore?.filePath)).resolves.toEqual({
    content: '# current state', userVersion: DATABASE_SCHEMA_VERSION
  });
  await expect(readSnapshotState(preMigration?.filePath)).resolves.toEqual({
    content: '# restored old state', userVersion: DATABASE_SCHEMA_VERSION - 1
  });

  await restoreApplicationDatabaseBackup({ sourcePath: preRestore?.filePath ?? '' });
  expect(loadWorkspaceSnapshot({ includeBody: true })?.nodesById['node-1']?.content).toBe('# current state');
});

async function readSnapshotState(filePath: string | undefined) {
  if (!filePath) throw new Error('snapshot path is required');
  const materialized = await materializeCompressedSqliteBackup(filePath, tempRoot);
  try {
    const sqlite = new BetterSqlite3(materialized.databasePath, { readonly: true });
    try {
      const row = sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get('node-1') as { content: string };
      return { content: row.content, userVersion: sqlite.pragma('user_version', { simple: true }) };
    } finally {
      sqlite.close();
    }
  } finally {
    await materialized.cleanup();
  }
}

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
