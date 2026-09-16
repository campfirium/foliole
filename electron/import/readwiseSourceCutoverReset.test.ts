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
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { restartReadwiseApiCandidateRun } from '../database/readwiseApiCandidateRun.js';
import { loadReadwiseApiCandidates, saveReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import {
  invalidateIncompleteReadwiseSourceCutover,
  restartIncompleteReadwiseSourceCutover
} from './readwiseSourceCutoverReset.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-reset-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

it('invalidates an unfinished fact batch without deleting imported Topics', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('kept-topic',NULL,'topic','Kept',0,'body','old','old')`);
  driver.execute(`INSERT INTO readwise_api_import_runs (
    connection_ref,query_updated_after,round_started_at,reader_cursor,export_cursor,phase,updated_at
  ) VALUES ('connection',NULL,'old','cursor',NULL,'reader','old')`);
  driver.execute(`INSERT INTO readwise_api_import_stage (connection_ref,record_kind,remote_id,payload_json)
    VALUES ('connection','reader','document-1','{}')`);
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: ['document-1'], completedAt: 'old',
    documents: [], phase: 'indexing', retiredNodeIds: [], sourceHost: 'This Mac',
    startedAt: 'old', status: 'migration-in-progress'
  });

  expect(invalidateIncompleteReadwiseSourceCutover({
    connectionRef: 'connection', sourceHost: 'This Mac'
  })).toBe(true);

  expect(driver.queryOne("SELECT id FROM nodes WHERE id='kept-topic'")).toEqual({ id: 'kept-topic' });
  expect(driver.queryOne('SELECT connection_ref FROM readwise_api_import_runs')).toBeUndefined();
  expect(driver.queryOne('SELECT remote_id FROM readwise_api_import_stage')).toBeUndefined();
  expect(loadReadwiseSourceCutover()).toMatchObject({
    cohortDocumentIds: [], documents: [], phase: 'indexing', status: 'migration-in-progress'
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('clears ordinary candidate state before starting an exact-id cutover', () => {
  const policy = createDefaultReadwiseAutoImportPolicy();
  restartReadwiseApiCandidateRun('connection', policy, '2026-09-09T00:00:00.000Z');
  saveReadwiseApiCandidates('connection', [{
    destination: 'inbox', documentId: 'document-1', exportCategory: null,
    hasHighlights: true, highlightIds: ['highlight-1'], matchedImportTag: false,
    noteIds: [], readerCategory: 'article', status: 'ready', title: 'Fetched'
  }]);

  restartIncompleteReadwiseSourceCutover({
    connectionRef: 'connection', sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z'
  });

  expect(loadReadwiseApiCandidates('connection')).toHaveLength(0);
  expect(loadReadwiseSourceCutover()).toMatchObject({
    cohortDocumentIds: [], phase: 'indexing', status: 'migration-in-progress'
  });
});
