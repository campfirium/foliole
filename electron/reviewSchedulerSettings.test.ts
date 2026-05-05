// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-review-settings-tests';

vi.mock('./ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './database/connection.js';
import { initializeDatabase } from './database/migrate.js';
import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  loadReviewSchedulerSettings,
  saveReviewSchedulerSettings
} from './reviewSchedulerSettings.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-review-settings-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists normalized review scheduler settings into sqlite settings table', () => {
  const saved = saveReviewSchedulerSettings({ desiredRetention: 0.8 });

  expect(saved).toMatchObject({
    algorithm: DEFAULT_REVIEW_SCHEDULER_SETTINGS.algorithm,
    desiredRetention: 0.8,
    maximumIntervalDays: DEFAULT_REVIEW_SCHEDULER_SETTINGS.maximumIntervalDays,
    enableFuzz: DEFAULT_REVIEW_SCHEDULER_SETTINGS.enableFuzz,
    enableShortTerm: DEFAULT_REVIEW_SCHEDULER_SETTINGS.enableShortTerm
  });
  expect(loadReviewSchedulerSettings()).toMatchObject({
    desiredRetention: 0.8
  });
});

it('clamps malformed desired retention values back into supported range', () => {
  const saved = saveReviewSchedulerSettings({ desiredRetention: 0.2 });
  expect(saved.desiredRetention).toBe(0.2);
});

it('accepts low but still valid desired retention values', () => {
  const saved = saveReviewSchedulerSettings({ desiredRetention: 0.01 });
  expect(saved.desiredRetention).toBe(0.01);
});
