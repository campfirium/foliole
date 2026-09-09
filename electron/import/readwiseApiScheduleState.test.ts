// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { saveJsonSetting } from '../database/settingsStore.js';

import {
  beginReadwiseApiTrackedRun,
  completeReadwiseApiTrackedRun,
  failReadwiseApiTrackedRun,
  isReadwiseApiTrackedRunActive,
  loadReadwiseApiScheduleState,
  queueReadwiseApiTrackedRun,
  recoverInterruptedReadwiseApiRun,
  updateReadwiseApiTrackedRunStage
} from './readwiseApiScheduleState.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-run-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('persists queued, running, interrupted, failed, and completed lifecycle states', () => {
  const connectionRef = 'connection';
  queueReadwiseApiTrackedRun({
    connectionRef, kind: 'initial', queuedAt: '2026-09-10T00:00:00.000Z', trigger: 'startup'
  });
  expect(loadReadwiseApiScheduleState(connectionRef).lifecycle?.status).toBe('queued');

  beginReadwiseApiTrackedRun(connectionRef, 'startup', 'initial', '2026-09-10T00:00:01.000Z');
  updateReadwiseApiTrackedRunStage('writing');
  expect(isReadwiseApiTrackedRunActive(connectionRef)).toBe(true);
  expect(loadReadwiseApiScheduleState(connectionRef).lifecycle).toMatchObject({
    kind: 'initial', stage: 'writing', status: 'running'
  });

  recoverInterruptedReadwiseApiRun(connectionRef, '2026-09-10T00:00:02.000Z');
  expect(isReadwiseApiTrackedRunActive(connectionRef)).toBe(false);
  expect(loadReadwiseApiScheduleState(connectionRef).lifecycle).toMatchObject({
    error_reason: null, finished_at: '2026-09-10T00:00:02.000Z', status: 'interrupted'
  });

  beginReadwiseApiTrackedRun(connectionRef, 'manual', 'initial', '2026-09-10T00:00:03.000Z');
  failReadwiseApiTrackedRun(connectionRef, new Error('readwise_api_reconnect_required'), '2026-09-10T00:00:04.000Z');
  expect(loadReadwiseApiScheduleState(connectionRef).lifecycle).toMatchObject({
    error_reason: 'readwise_api_reconnect_required', status: 'failed'
  });

  beginReadwiseApiTrackedRun(connectionRef, 'manual', 'initial', '2026-09-10T00:00:05.000Z');
  completeReadwiseApiTrackedRun(connectionRef, {
    completed_at: '2026-09-10T00:00:06.000Z', failed_count: 0,
    imported_count: 2, source_count: 2, status: 'completed'
  });
  const completedState = loadReadwiseApiScheduleState(connectionRef);
  expect(completedState.lifecycle).toMatchObject({
    finished_at: '2026-09-10T00:00:06.000Z', status: 'completed'
  });
  expect(completedState.initialProgress).toEqual({
    completed_count: 2, failed_count: 0, pending_count: 0,
    total_count: 2, unexplained_failure_count: 0
  });
});

it('fails closed for an unknown persisted lifecycle version', () => {
  saveJsonSetting('readwise_api_schedule_state', { connectionRef: 'connection', version: 99 });
  expect(() => loadReadwiseApiScheduleState('connection'))
    .toThrow('readwise_api_schedule_state_unknown_version:99');
});
