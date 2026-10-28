// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs'),
  documents_dir: path.join(appData, 'Documents')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./backupCleanupNotification.js', () => ({ showBackupCleanupNotification: vi.fn() }));
vi.mock('./backupFileDisposition.js', () => ({
  moveManagedBackupToTrash: (file: string) => fs.rm(file, { force: true })
}));

import { submitDesktopOperation } from '../desktopOperations.js';

import { reconcileAutomaticDatabaseBackups } from './backupRestore.js';
import { loadBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';
import { openDesktopDailyFlow } from './dailyFlow.js';
import { runDesktopDatabaseWrite } from './desktopDatabaseWriteQueue.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

beforeEach(async () => {
  appData = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-foreground-'));
  await initializeDatabase();
  saveBackupSettings({ daily_max_count: 0, hourly_max_count: 1, monthly_max_count: 0, weekly_max_count: 0 });
  upsertNodeSnapshot({ nodeId: 'backup-flow-topic', parentNodeId: null, kind: 'topic',
    title: 'Backup flow topic', content: 'Complete reading body', isTitleManual: true,
    reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(appData, { recursive: true, force: true });
});

it('opens and persists Flow while an automatic snapshot awaits compressed publication', async () => {
  let release!: () => void;
  let signalReady!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { signalReady = resolve; });
  const link = fs.link.bind(fs);
  const publish = vi.spyOn(fs, 'link').mockImplementation(async (source, target) => {
    if (String(target).endsWith('.db.gz')) {
      signalReady();
      await held;
    }
    await link(source, target);
  });
  const now = new Date(2026, 9, 28, 10);
  const backup = submitDesktopOperation('automatic-backup', {
    run: () => reconcileAutomaticDatabaseBackups(now)
  });
  let foreground: Promise<unknown> | undefined;
  try {
    await Promise.race([ready, backup.promise.then(() => {
      throw new Error('Automatic backup finished without reaching compressed publication.');
    })]);
    let opened = false;
    foreground = runDesktopDatabaseWrite('foreground', () => openDesktopDailyFlow({
      now: now.toISOString(), mode: 'recommended'
    })).then(result => { opened = true; return result; });
    await expect.poll(() => opened, { timeout: 1000 }).toBe(true);
    const persisted = await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver
      .queryAll('SELECT node_id FROM daily_flow_entries'));
    expect(persisted.length).toBeGreaterThan(0);
    release();
    await backup.promise;
    const directory = resolveManagedBackupDirectory(loadBackupSettings());
    const [name] = (await fs.readdir(directory)).filter(name => name.endsWith('.db.gz'));
    expect(name).toBeDefined();
    const snapshot = path.join(appData, 'snapshot.db');
    await fs.writeFile(snapshot, gunzipSync(await fs.readFile(path.join(directory, name!))));
    const reader = new Database(snapshot, { readonly: true });
    try {
      expect(reader.pragma('quick_check', { simple: true })).toBe('ok');
      expect(reader.prepare('SELECT count(*) AS n FROM daily_flow_entries').get()).toEqual({ n: 0 });
      expect(reader.prepare('SELECT count(*) AS n FROM nodes').get()).toEqual(
        openDatabaseConnection().driver.queryOne('SELECT count(*) AS n FROM nodes'));
    } finally { reader.close(); }
  } finally {
    release();
    await Promise.allSettled([backup.promise, foreground]);
    publish.mockRestore();
  }
}, 10000);
