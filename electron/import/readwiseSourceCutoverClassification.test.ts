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
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { recordReadwiseSourceCutoverClassification } from './readwiseSourceCutoverClassification.js';
import { createReadwiseDocumentMigration } from './readwiseSourceCutoverJournal.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cutover-classification-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: ['document-1'], completedAt: '2026-09-09T01:00:00.000Z',
    documents: [], retiredNodeIds: ['retired-1'], sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z', status: 'migration-in-progress'
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('records a deleted document and its annotations as blocked tombstones', () => {
  recordReadwiseSourceCutoverClassification(document(), 'blocked', {
    annotations: [],
    nodeId: 'deleted-document-node',
    remoteDocumentId: 'document-1',
    sourceFingerprint: 'source-1'
  });
  const stored = JSON.parse(openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}');
  expect(stored.documents).toEqual([
    { nodeId: 'deleted-document-node', remoteId: 'document-1', status: 'blocked' }
  ]);
  expect(stored.annotations).toEqual([
    { nodeId: null, remoteId: 'highlight-1', status: 'blocked' }
  ]);
});

it('allows an unmatched selected document to materialize regardless of its creation time', async () => {
  const migration = createReadwiseDocumentMigration({ bindingFor: () => null }, 'connection');
  await expect(migration.beforeCommit(document())).resolves.toBeUndefined();
});

it('allows an unmatched document created after cutover to use the normal import policy', async () => {
  const migration = createReadwiseDocumentMigration({ bindingFor: () => null }, 'connection');
  await expect(migration.beforeCommit({
    ...document(), id: 'document-new', createdAt: '2026-09-10T00:00:00.000Z'
  })).resolves.toBeUndefined();
});

function document(): PreparedReadwiseApiDocument {
  return {
    annotations: [{
      content: 'Highlight', contentHash: 'hash', createdAt: '2026-09-08T00:00:00.000Z',
      kind: 'highlight', locatorText: 'Highlight', parentRemoteId: null,
      remoteId: 'highlight-1', updatedAt: '2026-09-08T00:00:00.000Z'
    }],
    body: '# Retired', category: 'epub', coverImageUrl: null,
    createdAt: '2026-09-08T00:00:00.000Z', degradedReason: null, epubStructure: null,
    id: 'document-1', metadata: {
      author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Retired'
    },
    title: 'Retired', unmatchedAnnotationCount: 0, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}
