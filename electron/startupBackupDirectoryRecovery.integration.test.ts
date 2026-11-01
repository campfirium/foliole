// @vitest-environment node
import { promises as fs, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ choose: vi.fn(), quit: vi.fn(), relaunch: vi.fn() }));
let root = '';
vi.mock('electron', () => ({ app: { quit: native.quit, relaunch: native.relaunch },
  dialog: { showMessageBox: native.choose } }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: vi.fn() }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'app'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs'),
  documents_dir: path.join(root, 'Documents')
}) }));

import { DATABASE_SCHEMA_VERSION } from '../lib/core/database/migrations.js';

import { normalizeBackupSettings, resolveManagedBackupDirectory } from './database/backupSettings.js';
import { materializeCompressedSqliteBackup } from './database/compressedSqliteBackup.js';
import { closeDatabaseConnection, openDatabaseConnection } from './database/connection.js';
import { historicalTextbookLibrary } from './database/historicalTextbookLibrary.testSupport.js';
import { assertManagedSafetySnapshotIntegrity, waitForManagedSafetySnapshotSettlements } from './database/managedSafetySnapshots.js';
import { initializeDatabase } from './database/migrate.js';
import { loadJsonSetting } from './database/settingsStore.js';
import { loadStartupErrorSurface } from './startupErrorSurface.js';

beforeEach(async () => {
  vi.clearAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-startup-backup-'));
  native.choose.mockResolvedValue({ response: 0 });
});
afterEach(async () => {
  await waitForManagedSafetySnapshotSettlements();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function olderLibrary(extra = '') {
  const dbPath = initializeDatabase().dbPath;
  closeDatabaseConnection();
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
  const older = historicalTextbookLibrary(2, 2, 1);
  const settings = normalizeBackupSettings({ backup_dir: 'foreign-device-backups', extra_backup_dir: extra });
  const bodies = older.prepare('SELECT id, content FROM nodes ORDER BY id').all();
  older.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    'host_name', JSON.stringify('Previous desktop'), '2026-10-01T00:00:00.000Z');
  older.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    'backup_settings', JSON.stringify(settings), '2026-10-01T00:00:00.000Z');
  writeFileSync(dbPath, older.serialize());
  older.close();
  let failure: unknown;
  try { initializeDatabase(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain('folder on this device');
  return { bodies, failure, settings };
}

async function showFailure(error: unknown) {
  const window = { isDestroyed: () => false, isVisible: () => true } as unknown as BrowserWindow;
  const loadMainWindow = vi.fn();
  await loadStartupErrorSurface({ error, loadMainWindow, moduleLabel: 'Database migration', window });
  return loadMainWindow.mock.calls;
}

it('lets an explicit local correction unblock a snapshotted upgrade and survive reopening', async () => {
  const extra = path.join(root, 'valid-extra');
  const { bodies, failure } = olderLibrary(extra);
  const surfaces = await showFailure(failure);
  expect(native.choose).toHaveBeenCalledOnce();
  expect(native.relaunch, JSON.stringify(surfaces)).toHaveBeenCalledOnce();
  expect(native.quit).toHaveBeenCalledOnce();
  closeDatabaseConnection();
  const corrected = loadJsonSetting('backup_settings') as { backup_dir: string; extra_backup_dir: string };
  expect(corrected.backup_dir).toBe('');
  expect(corrected.extra_backup_dir).toBe(extra);
  expect(openDatabaseConnection().sqlite.pragma('user_version', { simple: true })).toBe(153);
  expect(openDatabaseConnection().sqlite.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual(bodies);
  initializeDatabase();
  await waitForManagedSafetySnapshotSettlements();
  expect(openDatabaseConnection().sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(openDatabaseConnection().sqlite.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual(bodies);
  const backupDir = resolveManagedBackupDirectory();
  const snapshots = (await fs.readdir(backupDir)).filter(name => /\.db(?:\.gz)?$/u.test(name));
  expect(snapshots.length).toBeGreaterThan(0);
  for (const name of snapshots) {
    const snapshotPath = path.join(backupDir, name);
    await expect(assertManagedSafetySnapshotIntegrity(snapshotPath)).resolves.toBeUndefined();
    const materialized = await materializeCompressedSqliteBackup(snapshotPath, path.join(root, 'snapshot-check'));
    const snapshot = new Database(materialized.databasePath, { readonly: true });
    try {
      expect(snapshot.pragma('user_version', { simple: true })).toBe(153);
      expect(snapshot.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual(bodies);
    } finally { snapshot.close(); await materialized.cleanup(); }
  }
  closeDatabaseConnection();
  expect(loadJsonSetting('backup_settings')).toMatchObject({ backup_dir: '', extra_backup_dir: extra });
});

it('preserves invalid settings, original facts and the old schema when correction is cancelled', async () => {
  native.choose.mockResolvedValue({ response: 1 });
  const { bodies, failure, settings } = olderLibrary('other-device-backups');
  await showFailure(failure);
  expect(native.choose).toHaveBeenCalledOnce();
  expect(native.relaunch).not.toHaveBeenCalled();
  closeDatabaseConnection();
  expect(loadJsonSetting('backup_settings')).toEqual(settings);
  expect(openDatabaseConnection().sqlite.pragma('user_version', { simple: true })).toBe(153);
  expect(openDatabaseConnection().sqlite.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual(bodies);
});

it('explicitly clears an invalid extra location together with the invalid primary location', async () => {
  const { failure } = olderLibrary('other-device-backups');
  await showFailure(failure);
  expect(native.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    detail: expect.stringContaining('other-device-backups')
  }));
  closeDatabaseConnection();
  expect(loadJsonSetting('backup_settings')).toMatchObject({ backup_dir: '', extra_backup_dir: '' });
});

it('keeps unrelated startup failures on the existing error surface without changing backup settings', async () => {
  const { settings } = olderLibrary();
  await showFailure(new Error('database unavailable'));
  expect(native.choose).not.toHaveBeenCalled();
  expect(native.relaunch).not.toHaveBeenCalled();
  closeDatabaseConnection();
  expect(loadJsonSetting('backup_settings')).toEqual(settings);
});


it('keeps the original settings and old schema when the explicit correction cannot be saved', async () => {
  const { failure, settings } = olderLibrary();
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER refuse_backup_correction BEFORE UPDATE ON settings
    WHEN NEW.key = 'backup_settings' BEGIN SELECT RAISE(ABORT, 'settings write refused'); END`);
  const surfaces = await showFailure(failure);
  expect(native.choose).toHaveBeenCalledOnce();
  expect(native.relaunch).not.toHaveBeenCalled();
  expect(native.quit).not.toHaveBeenCalled();
  expect(surfaces.at(-1)?.[1]).toMatchObject({ errorSummary: 'settings write refused' });
  closeDatabaseConnection();
  expect(loadJsonSetting('backup_settings')).toEqual(settings);
  expect(openDatabaseConnection().sqlite.pragma('user_version', { simple: true })).toBe(153);
});
