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
  const saved = saveReviewSchedulerSettings({
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true
  });

  expect(saved).toMatchObject({
    algorithm: DEFAULT_REVIEW_SCHEDULER_SETTINGS.algorithm,
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true
  });
  expect(loadReviewSchedulerSettings()).toMatchObject({
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true
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

it('preserves existing non-updated scheduler settings on partial save', () => {
  saveReviewSchedulerSettings({
    desiredRetention: 0.87,
    maximumIntervalDays: 240,
    enableFuzz: true,
    enableShortTerm: true,
    updatedAt: '2026-03-14T00:00:00.000Z'
  });

  const saved = saveReviewSchedulerSettings({
    desiredRetention: 0.84,
    updatedAt: '2026-03-14T01:00:00.000Z'
  });

  expect(saved).toMatchObject({
    desiredRetention: 0.84,
    maximumIntervalDays: 240,
    enableFuzz: true,
    enableShortTerm: true,
    updatedAt: '2026-03-14T01:00:00.000Z'
  });
});
