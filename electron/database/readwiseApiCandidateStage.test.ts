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
import { createDefaultReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import {
  completeReadwiseApiCandidateRun,
  isReadwiseApiMigrationPending,
  loadOrCreateReadwiseApiCandidateRun,
  loadReadwiseApiCandidateRun
} from './readwiseApiCandidateRun.js';
import {
  loadReadwiseApiCandidateProgress,
  loadReadwiseApiCandidates,
  saveReadwiseApiCandidates,
  setReadwiseApiCandidateStatus
} from './readwiseApiCandidateStage.js';
import { loadReadwiseApiCompletedThrough } from './readwiseApiImportState.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-candidate-stage-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps Reader EPUB books first while preferring candidates that can complete sooner', () => {
  saveReadwiseApiCandidates('connection', [
    candidate('book-large', 'epub', 360),
    candidate('article-small', 'article', 1),
    candidate('book-small', 'epub', 3)
  ]);

  expect(loadReadwiseApiCandidates('connection').map((item) => item.documentId)).toEqual([
    'book-small',
    'book-large',
    'article-small'
  ]);
});

it('keeps an active 29-of-31 manifest frozen when the policy changes', () => {
  const initialPolicy = createDefaultReadwiseAutoImportPolicy();
  const initialRun = loadOrCreateReadwiseApiCandidateRun(
    'connection', initialPolicy, '2026-09-10T00:00:00.000Z'
  );
  const candidates = Array.from({ length: 31 }, (_, index) =>
    candidate(`document-${index + 1}`, 'article', 1));
  saveReadwiseApiCandidates('connection', candidates);
  candidates.forEach((item, index) => setReadwiseApiCandidateStatus(
    'connection', item.documentId, index < 29 ? 'completed' : 'failed',
    index < 29 ? null : {
      failedAt: '2026-09-10T00:00:00.000Z',
      reason: 'request_failed',
      stage: 'fetching'
    }
  ));

  const resumed = loadOrCreateReadwiseApiCandidateRun('connection', {
    ...initialPolicy,
    articleWithoutHighlights: 'external'
  }, '2026-09-10T01:00:00.000Z');

  expect(resumed).toEqual(initialRun);
  expect(loadReadwiseApiCandidateProgress('connection')).toMatchObject({
    completedCount: 29,
    failedCount: 2,
    totalCount: 31
  });
});

it('persists retryable candidate failure facts without resetting completed candidates', () => {
  saveReadwiseApiCandidates('connection', [candidate('completed', 'epub', 1), candidate('failed', 'article', 1)]);
  setReadwiseApiCandidateStatus('connection', 'completed', 'completed', null);
  setReadwiseApiCandidateStatus('connection', 'failed', 'failed', {
    failedAt: '2026-09-10T00:00:00.000Z', reason: 'request_failed', stage: 'fetching'
  });

  expect(loadReadwiseApiCandidateProgress('connection')).toEqual({
    completedCount: 1, failedCount: 1, pendingCount: 0, totalCount: 2, unexplainedFailureCount: 0
  });
  expect(loadReadwiseApiCandidates('connection').find((item) => item.documentId === 'failed')?.failure)
    .toEqual({
      attemptCount: 1, failedAt: '2026-09-10T00:00:00.000Z', reason: 'request_failed', stage: 'fetching'
    });

  setReadwiseApiCandidateStatus('connection', 'failed', 'completed', null);
  expect(loadReadwiseApiCandidateProgress('connection')).toMatchObject({ completedCount: 2, failedCount: 0 });
});

it('carries the migration index boundary into the first sync and every later sync', () => {
  const policy = createDefaultReadwiseAutoImportPolicy();
  loadOrCreateReadwiseApiCandidateRun('connection', policy, '2026-09-10T00:00:00.000Z');
  expect(isReadwiseApiMigrationPending('connection')).toBe(true);

  completeReadwiseApiCandidateRun('connection', 'cutover', '2026-09-10T01:00:00.000Z');
  expect(isReadwiseApiMigrationPending('connection')).toBe(false);

  expect(loadReadwiseApiCompletedThrough('connection')).toBeNull();
  expect(loadReadwiseApiCandidateRun('connection')).toMatchObject({
    queryUpdatedAfter: '2026-09-09T23:59:00.000Z',
    roundStartedAt: '2026-09-10T01:00:00.000Z'
  });

  completeReadwiseApiCandidateRun('connection', 'sync', '2026-09-10T01:30:00.000Z');
  expect(loadReadwiseApiCompletedThrough('connection')).toBe('2026-09-10T00:59:00.000Z');
  expect(loadOrCreateReadwiseApiCandidateRun(
    'connection', policy, '2026-09-10T02:00:00.000Z'
  )).toMatchObject({
    queryUpdatedAfter: '2026-09-10T00:59:00.000Z',
    roundStartedAt: '2026-09-10T02:00:00.000Z'
  });
});

function candidate(documentId: string, readerCategory: 'article' | 'epub', highlightCount: number) {
  return {
    destination: 'inbox' as const,
    documentId,
    exportCategory: readerCategory === 'epub' ? 'articles' : 'books',
    hasHighlights: true,
    highlightIds: Array.from({ length: highlightCount }, (_, index) => `${documentId}-highlight-${index}`),
    readerCategory,
    status: 'pending' as const,
    title: null
  };
}
