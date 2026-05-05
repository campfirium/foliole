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
    enableShortTerm: true,
    pushQueue: {
      priorityRatio: 7,
      queueMixRatio: { reading: 2, fsrs: 4 },
      readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
    }
  });

  expect(saved).toMatchObject({
    algorithm: DEFAULT_REVIEW_SCHEDULER_SETTINGS.algorithm,
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true,
    pushQueue: {
      defaultPriority: 5,
      priorityRatio: 7,
      queueMixRatio: { reading: 2, fsrs: 4 },
      readingInitialIntervalMs: 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
    }
  });
  expect(loadReviewSchedulerSettings()).toMatchObject({
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true,
    pushQueue: {
      priorityRatio: 7,
      queueMixRatio: { reading: 2, fsrs: 4 },
      readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
    }
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
    pushQueue: {
      priorityRatio: 6,
      queueMixRatio: { reading: 2, fsrs: 6 },
      readingIntervalGrowthFactorRange: { min: 1.09, max: 1.47 }
    },
    updatedAt: '2026-03-14T00:00:00.000Z'
  });

  const saved = saveReviewSchedulerSettings({
    desiredRetention: 0.84,
    pushQueue: {
      readingIntervalGrowthFactorRange: { min: 1.12 }
    },
    updatedAt: '2026-03-14T01:00:00.000Z'
  });

  expect(saved).toMatchObject({
    desiredRetention: 0.84,
    maximumIntervalDays: 240,
    enableFuzz: true,
    enableShortTerm: true,
    pushQueue: {
      priorityRatio: 6,
      queueMixRatio: { reading: 2, fsrs: 6 },
      readingIntervalGrowthFactorRange: { min: 1.12, max: 1.47 }
    },
    updatedAt: '2026-03-14T01:00:00.000Z'
  });
});

it('restores push queue settings after save and database restart', () => {
  saveReviewSchedulerSettings({
    desiredRetention: 0.82,
    pushQueue: {
      priorityRatio: 8,
      queueMixRatio: { reading: 3, fsrs: 5 },
      readingIntervalGrowthFactorRange: { min: 1.07, max: 1.39 }
    },
    updatedAt: '2026-03-14T02:00:00.000Z'
  });

  closeDatabaseConnection();
  initializeDatabase();

  expect(loadReviewSchedulerSettings()).toMatchObject({
    desiredRetention: 0.82,
    pushQueue: {
      priorityRatio: 8,
      queueMixRatio: { reading: 3, fsrs: 5 },
      readingIntervalGrowthFactorRange: { min: 1.07, max: 1.39 }
    },
    updatedAt: '2026-03-14T02:00:00.000Z'
  });
});
