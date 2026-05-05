// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-review-ipc-tests';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { reviewPreview } from './review.js';

const NOW = '2026-03-06T00:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-review-ipc-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createInitialCard() {
  return {
    due: NOW,
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  };
}

function createReviewedCard() {
  return {
    due: NOW,
    last_review: '2026-03-01T00:00:00.000Z',
    state: 2 as const,
    stability: 4.5,
    difficulty: 4.2,
    elapsed_days: 5,
    scheduled_days: 5,
    reps: 6,
    lapses: 1
  };
}

it('returns Again/Hard/Good/Easy preview payload for one card', () => {
  const preview = reviewPreview({
    request: {
      card: createInitialCard(),
      now: NOW
    }
  });

  expect(Object.keys(preview)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  expect(preview.Again.reviewed_at).toBe(NOW);
  expect(preview.Hard.reviewed_at).toBe(NOW);
  expect(preview.Good.reviewed_at).toBe(NOW);
  expect(preview.Easy.reviewed_at).toBe(NOW);
  expect(Date.parse(preview.Again.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Hard.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Good.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Easy.card.due)).not.toBeNaN();
});

it('rebuilds scheduler preview when desired retention changes', () => {
  const defaultPreview = reviewPreview({
    request: {
      card: createReviewedCard(),
      now: NOW
    }
  });

  saveReviewSchedulerSettings({ desiredRetention: 0.8 });

  const tunedPreview = reviewPreview({
    request: {
      card: createReviewedCard(),
      now: NOW
    }
  });

  expect(Date.parse(tunedPreview.Good.card.due)).toBeGreaterThan(
    Date.parse(defaultPreview.Good.card.due)
  );
});
