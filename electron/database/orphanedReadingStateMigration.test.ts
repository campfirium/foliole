// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(appRoot, 'app'), app_cache_dir: path.join(appRoot, 'cache'),
  app_config_dir: path.join(appRoot, 'config'), app_log_dir: path.join(appRoot, 'logs'),
  documents_dir: path.join(appRoot, 'Documents')
}) }));

import { softDeleteNodes, upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';

import { listApplicationDatabaseBackups } from './backupRestore.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { migrateOrphanedInactiveReadingState } from './orphanedReadingStateMigration.js';

const ID = 'orphaned-inactive-reading-state-v1';
beforeEach(async () => { appRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-retention-')); });
afterEach(async () => { closeDatabaseConnection(); await fs.rm(appRoot, { recursive: true, force: true }); });

function seedLegacyOrphan() {
  const connection = initializeDatabase();
  upsertNodeSnapshot(connection.driver, { nodeId: 'old', kind: 'topic', title: 'Old', content: 'Body',
    parentNodeId: null, isTitleManual: true, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' });
  saveNodeReadingStateWithSync(connection.driver, { nodeId: 'old', hostName: 'source',
    updatedAt: '2026-08-01T00:00:00Z', reading: { intervalDurationMs: 1000, intervalGrowthFactor: 1,
      lastHandledAt: '2026-08-01T00:00:00Z', nextAt: '2026-08-02T00:00:00Z',
      priority: 1, repetitionCount: 1, readingPosition: 0.4, state: 'active' } });
  softDeleteNodes(connection.driver, { nodeIds: ['old'], deletedAt: '2026-08-03T00:00:00Z' });
  connection.sqlite.exec('DELETE FROM node_reading; DELETE FROM node_reading_host_state');
  connection.sqlite.prepare('DELETE FROM data_migration_state WHERE migration_id = ?').run(ID);
  return connection;
}

it('repairs an already upgraded library on reopen once and preserves its deleted node', async () => {
  const connection = seedLegacyOrphan();
  const before = connection.sqlite.prepare("SELECT * FROM nodes WHERE id = 'old'").get();
  closeDatabaseConnection();
  const reopened = initializeDatabase();
  expect(reopened.sqlite.prepare("SELECT * FROM nodes WHERE id = 'old'").get()).toEqual(before);
  expect(reopened.sqlite.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_type = 'node_reading'").pluck().get()).toBe(0);
  const state = reopened.sqlite.prepare('SELECT * FROM data_migration_state WHERE migration_id = ?').get(ID);
  expect(state).toMatchObject({ status: 'completed' });
  expect((await listApplicationDatabaseBackups()).some((backup) => backup.kind === 'snapshot')).toBe(true);
  closeDatabaseConnection();
  expect(initializeDatabase().sqlite.prepare('SELECT * FROM data_migration_state WHERE migration_id = ?').get(ID)).toEqual(state);
});

it('rolls back retired flags and completion together when startup migration fails', () => {
  const connection = seedLegacyOrphan();
  connection.sqlite.exec(`CREATE TRIGGER reject_reading_migration BEFORE INSERT ON data_migration_state
    WHEN NEW.migration_id = '${ID}' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`);
  expect(() => connection.sqlite.transaction(() => migrateOrphanedInactiveReadingState(connection))()).toThrow('fixture failure');
  expect(connection.sqlite.prepare("SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_reading'").pluck().get()).toBe(1);
  expect(connection.sqlite.prepare('SELECT * FROM data_migration_state WHERE migration_id = ?').get(ID)).toBeUndefined();
});
