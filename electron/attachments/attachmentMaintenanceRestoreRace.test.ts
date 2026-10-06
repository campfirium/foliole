// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs')
}) }));

const scanGate = vi.hoisted(() => ({
  active: false,
  entered: null as null | (() => void),
  release: null as null | (() => void)
}));
vi.mock('./attachmentTrashFiles.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./attachmentTrashFiles.js')>();
  return {
    ...actual,
    async inventoryAttachmentDirectory(directoryPath: string) {
      if (scanGate.active) {
        scanGate.entered?.();
        await new Promise<void>((resolve) => { scanGate.release = resolve; });
      }
      return actual.inventoryAttachmentDirectory(directoryPath);
    }
  };
});

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { runDesktopAttachmentMaintenance } from './attachmentMaintenanceService.js';

beforeEach(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-restore-race-'));
  scanGate.active = false;
  scanGate.entered = null;
  scanGate.release = null;
  initializeDatabase();
});

afterEach(() => {
  scanGate.release?.();
  closeDatabaseConnection();
  fs.rmSync(appData, { recursive: true, force: true });
});

it('reopens the current connection and rejects a scan that crossed database replacement', async () => {
  const { assetsDir } = resolveRuntimeDataPaths();
  fs.mkdirSync(assetsDir, { recursive: true });
  const key = `${createHash('sha256').update('orphan').digest('hex')}.png`;
  fs.writeFileSync(path.join(assetsDir, key), 'orphan');
  await runDesktopAttachmentMaintenance({ action: 'configure',
    settings: { automatic: false, observationThreshold: 1 } });

  let entered!: () => void;
  const scanning = new Promise<void>((resolve) => { entered = resolve; });
  scanGate.active = true;
  scanGate.entered = entered;
  const observation = runDesktopAttachmentMaintenance({ action: 'observe' });
  await scanning;

  const databasePath = openDatabaseConnection().dbPath;
  closeDatabaseConnection();
  fs.copyFileSync(databasePath, `${databasePath}.replacement`);
  fs.renameSync(`${databasePath}.replacement`, databasePath);
  initializeDatabase();
  scanGate.active = false;
  scanGate.release?.();

  await expect(observation).rejects.toThrow(/attachment_scan_database_(changed|replaced)/);
  expect(fs.existsSync(path.join(assetsDir, key))).toBe(true);
});
