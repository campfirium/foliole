// @vitest-environment node
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));
let appRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(appRoot, 'app'), app_cache_dir: path.join(appRoot, 'cache'),
  app_config_dir: path.join(appRoot, 'config'), app_log_dir: path.join(appRoot, 'logs'),
  documents_dir: path.join(appRoot, 'Documents')
}) }));

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { saveImportManagerSettings } from '../import/importManagerSettings.js';
import { runKeepImportRule } from '../import/keepImportService.js';
import { restoreRemovedSource } from '../import/removedSourceRestore.js';
import { loadRemovedSources } from '../ipc/removedSourcesPayload.js';

import { listApplicationDatabaseBackups } from './backupRestore.js';
import { resolveManagedBackupDirectory } from './backupSettings.js';
import { materializeCompressedSqliteBackup } from './compressedSqliteBackup.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently } from './nodeMutations.js';

const BetterSqlite3 = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3');
beforeEach(async () => { appRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-cache-startup-')); });
afterEach(async () => {
  await waitForManagedSafetySnapshotSettlements();
  closeDatabaseConnection();
  await fs.rm(appRoot, { recursive: true, force: true });
});
function previousLibrary() {
  const connection = initializeDatabase();
  connection.sqlite.exec(`INSERT INTO keep_import_item_cache VALUES
    ('orphan', '/unavailable', 'Old title', 'Unique historical body', 'Preview', 1, 2, 'then', NULL);
    PRAGMA user_version = 126;`);
  return connection;
}

it('actual startup preserves deleted content in a verified recoverable safety snapshot before upgrading', async () => {
  const previous = previousLibrary();
  const before = previous.sqlite.prepare('SELECT * FROM keep_import_item_cache').all();
  closeDatabaseConnection();
  const upgraded = initializeDatabase();
  expect(upgraded.sqlite.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual([]);
  await waitForManagedSafetySnapshotSettlements();
  const snapshots = (await listApplicationDatabaseBackups()).filter((row) => row.kind === 'snapshot');
  expect(snapshots).toHaveLength(1);
  const snapshot = await materializeCompressedSqliteBackup(snapshots[0]!.filePath, appRoot);
  try {
    const db = new BetterSqlite3(snapshot.databasePath, { readonly: true });
    try {
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(db.pragma('user_version', { simple: true })).toBe(126);
      expect(db.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual(before);
    } finally { db.close(); }
  } finally { await snapshot.cleanup(); }
  closeDatabaseConnection();
  initializeDatabase();
  await waitForManagedSafetySnapshotSettlements();
  expect((await listApplicationDatabaseBackups()).filter((row) => row.kind === 'snapshot')).toHaveLength(1);
});

it('a real snapshot filesystem failure blocks startup without deleting caches or advancing the version', async () => {
  const previous = previousLibrary();
  const databasePath = previous.dbPath;
  const backupDir = resolveManagedBackupDirectory();
  closeDatabaseConnection();
  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.writeFile(backupDir, 'blocked directory');
  expect(() => initializeDatabase(undefined, { recovery: 'fail' })).toThrow('snapshot');
  const db = new BetterSqlite3(databasePath, { readonly: true });
  try {
    expect(db.pragma('user_version', { simple: true })).toBe(126);
    expect(db.prepare('SELECT content FROM keep_import_item_cache').all())
      .toEqual([{ content: 'Unique historical body' }]);
  } finally { db.close(); }
  await fs.rm(backupDir);
  initializeDatabase(undefined, { recovery: 'fail' });
  expect(openDatabaseConnection().sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('keeps Removed readable and restorable through production import after the actual upgrade', async () => {
  initializeDatabase();
  const sourceDir = path.join(appRoot, 'watch');
  await fs.mkdir(sourceDir);
  await fs.writeFile(path.join(sourceDir, 'entry.md'), '# Entry\n\nPreserved source body.');
  saveImportManagerSettings({ sources: [{ id: 'rule', actionMode: 'keep', archivePath: '',
    highlightMode: 'merged', highlightPath: '', keepPreview: null, keepState: 'enabled', primaryPath: sourceDir }] });
  await runKeepImportRule({ directoryPath: sourceDir, highlightPolicy: 'reference_only', ruleId: 'rule' });
  const db = openDatabaseConnection().sqlite;
  const nodeId = db.prepare("SELECT last_node_id FROM keep_import_items WHERE rule_id = 'rule'").pluck().get() as string;
  const order = loadDerivedNodeOrder(openDatabaseConnection().driver).map((node_id) => ({ node_id }));
  deleteNodesPermanently({ nodeIds: [nodeId], nodeOrder: order.map((row) => row.node_id) });
  db.exec("INSERT INTO keep_import_item_cache VALUES ('orphan', '/other', 'Old', 'Unique', NULL, 1, 2, 'then', NULL); PRAGMA user_version = 126");
  const before = (await loadRemovedSources()).entries;
  expect(before).toHaveLength(1);
  closeDatabaseConnection();
  initializeDatabase();
  expect((await loadRemovedSources()).entries).toEqual(before);
  expect((await loadRemovedSources()).entries[0]!.content).toContain('Preserved source body.');
  const restored = await restoreRemovedSource('rule', 'entry.md');
  expect(restored.status).toBe('restored');
  expect(restored.node_id).toEqual(expect.any(String));
  expect(restored.node_id).not.toBe(nodeId);
  expect(openDatabaseConnection().sqlite.prepare("SELECT local_node_state FROM keep_import_items WHERE rule_id = 'rule'").pluck().get()).toBe('active');
});
