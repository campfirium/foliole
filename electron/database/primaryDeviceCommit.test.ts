// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-primary-device-commit-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./deviceIdentity.js', () => ({
  loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop')
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { commitPrimaryDeviceToPeer, loadCommittedPrimaryDevice } from './primaryDeviceCommit.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-primary-device-commit-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('stores primary device commit on the peer row and increments epoch on handoff', () => {
  expect(loadCommittedPrimaryDevice()).toBeNull();

  const first = commitPrimaryDeviceToPeer({
    primaryDeviceId: 'device-android',
    updatedAt: '2026-05-10T00:00:00.000Z',
    updatedByDeviceId: 'device-android'
  });
  const second = commitPrimaryDeviceToPeer({
    primaryDeviceId: 'device-tablet',
    updatedAt: '2026-05-10T00:05:00.000Z',
    updatedByDeviceId: 'device-tablet'
  });

  expect(first.primaryDeviceEpoch).toBe(1);
  expect(second.primaryDeviceEpoch).toBe(2);
  expect(loadCommittedPrimaryDevice()).toEqual(second);
});
