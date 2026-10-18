import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
const runs = vi.hoisted(() => ({ active: true }));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: root, app_config_dir: path.join(root, 'config'),
    app_cache_dir: path.join(root, 'cache'), app_log_dir: path.join(root, 'logs') })
}));
vi.mock('../import/keepImportRunnerOwner.js', () => ({
  hasActiveReadwiseKeepImportRuns: () => runs.active
}));
vi.mock('../import/readwiseApiImportRun.js', () => ({
  cancelReadwiseApiImport: () => undefined, isReadwiseApiImportActive: () => false
}));

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from '../database/readwiseOwnerGuard.js';
import { saveJsonSetting } from '../database/settingsStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';

import { handleReadwiseOwnerStop, resumeReadwiseExecutionAfterActivation } from './readwiseOwnerStop.js';

const local = identity('11111111-1111-4111-8111-111111111111', '/old');
const target = identity('22222222-2222-4222-8222-222222222222', '/new');
function identity(anchor: string, libraryPath: string) {
  return createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group',
    library_path: libraryPath, path_flavor: 'posix' });
}
function stop() {
  return handleReadwiseOwnerStop(JSON.stringify({ epoch: 2, groupId: 'group', mode: 'relay',
    ownerId: local.identity_key, requestId: 'attempt', targetId: target.identity_key }), target.identity_key);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-stop-expiry-'));
  initializeDatabase();
  createDesktopSyncGroup({ device: local, deviceName: 'Old', platform: 'darwin' });
  registerSyncGroupDevice({ device: target, deviceName: 'New', platform: 'win32' });
  saveJsonSetting('readwise_source_mode', { mode: 'relay', version: 1 });
  saveJsonSetting('readwise_active_host', { device_identity_key: local.identity_key,
    host_name: 'Old', epoch: 2 });
  saveReadwiseOwnerGuard({ epoch: 2, groupId: 'group', mode: 'relay', ownerId: local.identity_key,
    state: 'active', targetId: null });
  runs.active = true;
  vi.useFakeTimers();
});
afterEach(async () => {
  resumeReadwiseExecutionAfterActivation();
  vi.useRealTimers();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('resumes the original owner when an unacknowledged handoff is abandoned', () => {
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
  expect(stop().status).toBe('pending');
  expect(loadReadwiseHostAssignment().is_active).toBe(false);
  runs.active = false;
  vi.advanceTimersByTime(31_000);
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
  expect(loadReadwiseOwnerGuard('group')).toMatchObject({ state: 'active', epoch: 2, targetId: null });
  closeDatabaseConnection();
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
});

it('keeps admission stopped while the candidate continues retrying', () => {
  stop();
  vi.advanceTimersByTime(20_000);
  expect(stop().status).toBe('pending');
  vi.advanceTimersByTime(20_000);
  expect(loadReadwiseHostAssignment().is_active).toBe(false);
  vi.advanceTimersByTime(11_000);
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
});

it('never reactivates a relinquished owner after its earlier pending timeout', () => {
  stop();
  vi.advanceTimersByTime(20_000);
  runs.active = false;
  expect(stop().status).toBe('stopped');
  vi.advanceTimersByTime(61_000);
  expect(loadReadwiseHostAssignment().is_active).toBe(false);
  expect(loadReadwiseOwnerGuard('group')).toMatchObject({ state: 'relinquished', targetId: target.identity_key });
  resumeReadwiseExecutionAfterActivation();
  closeDatabaseConnection();
  expect(loadReadwiseHostAssignment().is_active).toBe(false);
  expect(stop().status).toBe('stopped');
});
