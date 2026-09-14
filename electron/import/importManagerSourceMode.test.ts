// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-manager-source-mode-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveJsonSetting } from '../database/settingsStore.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-source-mode-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('does not let a historical cutover override the library source mode', () => {
  saveJsonSetting('readwise_source_cutover', {
    completedAt: '2026-09-08T00:00:00.000Z', migratedCount: 12,
    sourceHost: 'This Mac', unmatchedCount: 0, version: 1
  });

  const saved = saveImportManagerSettings({ readwiseSourceMode: 'relay' });
  expect(saved.readwiseSourceMode).toBe('relay');
  expect(loadImportManagerSettings()).toMatchObject({
    readwiseSourceMode: 'relay',
    readwiseSourceModeConflict: ['completion_conflicts_with_mode']
  });
});

it('keeps completion proof while API mode is disabled and enables it again without migration', () => {
  const completion = {
    batchId: 'batch-1', completedAt: 'done', sourceHost: 'This Mac', startedAt: 'start'
  };
  saveJsonSetting('readwise_source_cutover_v2', {
    annotations: [], batchId: completion.batchId, cohortDocumentIds: [],
    completedAt: completion.completedAt, completionVersion: 2, documents: [], phase: null,
    retiredNodeIds: [], sourceHost: completion.sourceHost, startedAt: completion.startedAt,
    status: 'api', version: 2
  });
  saveJsonSetting('readwise_source_mode', { completion, mode: 'api', version: 1 });

  const disabled = saveImportManagerSettings({
    ...loadImportManagerSettings(), readwiseSourceMode: 'off'
  });
  expect(disabled).toMatchObject({
    readwiseApiMigrationCompleted: true, readwiseSourceMode: 'off'
  });
  expect(loadImportManagerSettings()).toMatchObject({
    readwiseApiMigrationCompleted: true, readwiseSourceMode: 'off'
  });

  const enabled = saveImportManagerSettings({ ...disabled, readwiseSourceMode: 'api' });
  expect(enabled.readwiseSourceMode).toBe('api');
  expect(loadImportManagerSettings()).toMatchObject({
    readwiseApiMigrationCompleted: true, readwiseSourceMode: 'api'
  });
});
