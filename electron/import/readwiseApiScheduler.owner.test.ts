// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_data_dir: appData, app_log_dir: path.join(appData, 'logs')
}) }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { resumePendingPdfAttachmentIndexing } from '../database/pdfIndexing.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { startReadwiseApiScheduler, stopReadwiseApiScheduler } from './readwiseApiScheduler.js';
import { loadReadwiseApiScheduleState } from './readwiseApiScheduleState.js';

let connectionRef = '';
beforeEach(async () => {
  appData = await mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-startup-owner-'));
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('Startup test');
  saveJsonSetting('readwise_source_mode', { mode: 'off', version: 1 });
  connectionRef = ensureReadwiseRemoteSource().connectionRef;
  saveJsonSetting('readwise_api_schedule_state', {
    connectionRef, initialProgress: null, lastResult: null, nextRunAt: null, version: 2,
    lifecycle: { error_reason: null, finished_at: null, kind: 'initial', progress: null,
      queued_at: '2026-10-01T00:00:00.000Z', run_id: 'abandoned-run', stage: 'writing',
      started_at: '2026-10-01T00:00:01.000Z', status: 'running', trigger: 'startup' }
  });
});
afterEach(async () => {
  stopReadwiseApiScheduler();
  closeDatabaseConnection();
  await rm(appData, { force: true, recursive: true });
});

function expectRecovered() {
  expect(loadReadwiseApiScheduleState(connectionRef)).toMatchObject({
    lastResult: null, nextRunAt: null,
    lifecycle: { run_id: 'abandoned-run', status: 'interrupted', stage: 'writing' }
  });
}

it('persists startup recovery without contention and preserves it on repeated startup', async () => {
  await startReadwiseApiScheduler();
  expectRecovered();
  const recovered = loadReadwiseApiScheduleState(connectionRef);
  await startReadwiseApiScheduler();
  expect(loadReadwiseApiScheduleState(connectionRef)).toEqual(recovered);
  closeDatabaseConnection();
  initializeDatabaseConnection(openDatabaseConnection());
  expect(loadReadwiseApiScheduleState(connectionRef)).toEqual(recovered);
});

it('recovers while the preceding production PDF startup task owns the connection', async () => {
  const pdfStartup = resumePendingPdfAttachmentIndexing();
  try { await startReadwiseApiScheduler(); } finally { await pdfStartup; }
  expectRecovered();
});

it('waits for an asynchronous owner and preserves its committed write', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const owner = runWithDatabaseConnectionOwner(async () => {
    await gate;
    saveJsonSetting('owner_commit', { committed: true });
  });
  let settled = false;
  const startup = Promise.resolve().then(startReadwiseApiScheduler);
  void startup.then(() => { settled = true; }, () => { settled = true; });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
  } finally { release(); await owner; }
  await startup;
  expectRecovered();
  expect(loadJsonSetting('owner_commit')).toEqual({ committed: true });
});

it('leaves a source-free library unchanged', async () => {
  openDatabaseConnection().driver.execute('DELETE FROM settings WHERE key = ?', ['readwise_remote_source']);
  const before = loadJsonSetting('readwise_api_schedule_state');
  await startReadwiseApiScheduler();
  expect(loadJsonSetting('readwise_api_schedule_state')).toEqual(before);
});

it('reports a real recovery write failure without manufacturing a completed run', async () => {
  openDatabaseConnection().driver.execute(`CREATE TRIGGER fail_recovery BEFORE UPDATE ON settings
    WHEN NEW.key = 'readwise_api_schedule_state' BEGIN SELECT RAISE(ABORT, 'recovery_write_failed'); END`);
  await expect(Promise.resolve().then(startReadwiseApiScheduler)).rejects.toThrow('recovery_write_failed');
  expect(loadReadwiseApiScheduleState(connectionRef)).toMatchObject({
    lastResult: null, lifecycle: { status: 'running', run_id: 'abandoned-run' }
  });
});
