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

import { restartIncompleteReadwiseSourceCutover } from './readwiseSourceCutoverReset.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-reset-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reopens a false completed journal and only restores its exact erroneous retired set', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,content,created_at,updated_at)
    VALUES ('topic-1',NULL,'topic','Kept','edited','old','new')`);
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,content,created_at,updated_at,deleted_at)
    VALUES ('retired-highlight','topic-1','topic','Retired','remote','old','new','mistaken')`);
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,content,created_at,updated_at,deleted_at)
    VALUES ('user-deleted','topic-1','topic','Deleted','local','old','new','user-action')`);
  driver.execute(`INSERT INTO import_sources (
    source_fingerprint,provider,source_kind,source_name,source_locator,first_imported_at,
    last_imported_at,last_content_fingerprint,latest_node_id,remote_provider,
    remote_connection_ref,remote_document_id,remote_annotations_json
  ) VALUES ('source-1','desktop_text_file','markdown','Kept','kept.md','old','old','hash',
    'topic-1','readwise','connection','document-1','[]')`);
  writeReadwiseSourceCutover({
    annotations: [{ nodeId: null, remoteId: 'highlight-1', status: 'suppressed' }],
    cohortDocumentIds: ['document-1'],
    completedAt: '2026-09-11T01:00:00.000Z',
    documents: [{ nodeId: null, remoteId: 'document-1', status: 'suppressed' }],
    retiredNodeIds: ['retired-highlight'],
    sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z',
    status: 'api'
  });

  restartIncompleteReadwiseSourceCutover({
    connectionRef: 'connection',
    policy: createDefaultReadwiseAutoImportPolicy(),
    sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z'
  });

  expect(loadReadwiseSourceCutover()).toMatchObject({
    annotations: [], cohortDocumentIds: [], documents: [], phase: 'indexing',
    retiredNodeIds: [], startedAt: '2026-09-09T00:00:00.000Z',
    status: 'migration-in-progress'
  });
  expect(driver.queryOne('SELECT id FROM nodes WHERE id=?', ['topic-1'])).toEqual({ id: 'topic-1' });
  expect(driver.queryOne<{ deleted_at: string | null }>(
    "SELECT deleted_at FROM nodes WHERE id='retired-highlight'"
  )).toEqual({ deleted_at: null });
  expect(driver.queryOne<{ deleted_at: string | null }>(
    "SELECT deleted_at FROM nodes WHERE id='user-deleted'"
  )).toEqual({ deleted_at: 'user-action' });
  expect(driver.queryOne<{ remote_document_id: string }>(
    "SELECT remote_document_id FROM import_sources WHERE source_fingerprint='source-1'"
  )).toEqual({ remote_document_id: 'document-1' });
});

it('reuses a complete fetched candidate set instead of clearing it and downloading again', () => {
  const policy = createDefaultReadwiseAutoImportPolicy();
  restartReadwiseApiCandidateRun('connection', policy, '2026-09-09T00:00:00.000Z');
  saveReadwiseApiCandidates('connection', [{
    destination: 'inbox', documentId: 'document-1', exportCategory: null,
    hasHighlights: true, highlightIds: ['highlight-1'], matchedImportTag: false,
    noteIds: [], readerCategory: 'article', status: 'ready', title: 'Fetched'
  }]);

  restartIncompleteReadwiseSourceCutover({
    connectionRef: 'connection', policy, sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z'
  });

  expect(loadReadwiseApiCandidates('connection')).toHaveLength(1);
  expect(loadReadwiseSourceCutover()).toMatchObject({
    cohortDocumentIds: ['document-1'], phase: 'indexing', status: 'migration-in-progress'
  });
});
