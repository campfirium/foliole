// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'data'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
import { beginSyncGroupLocalAdoption, finishSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { writeReadwiseSourceMode } from '../database/readwiseSourceMode.js';

import * as settings from './importManagerSettings.js';
import { refreshKeepImportMonitorFromSettings, startKeepImportMonitor, stopKeepImportMonitor } from './keepImportMonitorRuntime.js';
const adoption = { endpointUrl: 'http://127.0.0.1:38643', groupId: 'group-test',
  libraryEpoch: 'receiving', providerDeviceId: 'provider', providerDeviceName: 'Provider', providerPlatform: 'macOS' };
const progress = { groupId: adoption.groupId, overwriteId: adoption.libraryEpoch,
  providerDeviceId: adoption.providerDeviceId, providerLibraryEpoch: 'source-epoch',
  receiverDeviceId: 'receiver', receiverLibraryEpoch: adoption.libraryEpoch };
const port = () => createBetterSqliteDbPort(openDatabaseConnection().sqlite);
beforeEach(() => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/import-adoption-'));
  initializeDatabase();
});
afterEach(() => {
  stopKeepImportMonitor();
  vi.restoreAllMocks();
  closeDatabaseConnection();
  fs.rmSync(root, { recursive: true, force: true });
});
async function clearForAdoption() {
  await beginSyncGroupLocalAdoption(port(), adoption);
  await prepareSyncGroupOverwrite(port(), progress);
  expect(() => settings.loadImportManagerSettings()).toThrow('readwise_source_mode_invalid');
}
async function finishAdoption() {
  writeReadwiseSourceMode(openDatabaseConnection().driver, 'off');
  await port().transaction(async tx => {
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finishSyncGroupLocalAdoption(tx, adoption);
  });
}
it('suspends a running monitor during the cleared receive phase and resumes after adoption', async () => {
  await startKeepImportMonitor();
  await clearForAdoption();
  const read = vi.spyOn(settings, 'loadImportManagerSettings');
  await expect(refreshKeepImportMonitorFromSettings()).resolves.toBeUndefined();
  expect(read).not.toHaveBeenCalled();
  await finishAdoption();
  await refreshKeepImportMonitorFromSettings();
  expect(read).toHaveBeenCalled();
  expect(settings.loadImportManagerSettings().readwiseSourceMode).toBe('off');
});
it('starts safely during reception and respects an explicit stop before reception finishes', async () => {
  await clearForAdoption();
  await expect(startKeepImportMonitor()).resolves.toBeUndefined();
  stopKeepImportMonitor();
  await finishAdoption();
  const read = vi.spyOn(settings, 'loadImportManagerSettings');
  await refreshKeepImportMonitorFromSettings();
  expect(read).not.toHaveBeenCalled();
});
