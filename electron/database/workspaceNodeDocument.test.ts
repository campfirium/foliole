// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-node-document-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceNodeDocument } from './workspaceNodeDocument.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-node-document-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('reads the complete current body without consulting an obsolete shared blob', () => {
  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, 'blob body', '2026-04-27T00:00:00.000Z');
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading,
       content, body_blob_hash, created_at, updated_at
     ) VALUES ('node-1', NULL, 'topic', 'Node 1', 1, 0, 'inline body', ?, ?, ?)`,
    [bodyBlobHash, '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );

  expect(loadWorkspaceNodeDocument('node-1')?.content).toBe('inline body');
});

it('keeps the direct current body readable when an obsolete shared blob is unavailable', () => {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading,
       content, body_blob_hash, created_at, updated_at
     ) VALUES ('node-1', NULL, 'topic', 'Node 1', 1, 0, 'stale inline', 'missing-hash', ?, ?)`,
    ['2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );

  expect(loadWorkspaceNodeDocument('node-1')?.content).toBe('stale inline');
});

it('includes the node updated timestamp in loaded documents', () => {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading,
       content, current_version_id, created_at, updated_at
     ) VALUES ('node-1', NULL, 'topic', 'Node 1', 1, 0, 'body', 'version-1', ?, ?)`,
    ['2026-04-27T00:00:00.000Z', '2026-04-27T00:00:03.000Z']
  );

  expect(loadWorkspaceNodeDocument('node-1')).toMatchObject({
    currentVersionId: 'version-1',
    updatedAt: '2026-04-27T00:00:03.000Z'
  });
});

it('keeps newer stored content when an older node snapshot arrives later', () => {
  upsertNodeSnapshot({
    anchorLink: null,
    content: 'new body',
    createdAt: '2026-04-27T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: false,
    kind: 'topic',
    nodeId: 'node-1',
    parentNodeId: null,
    position: 0,
    reveal: null,
    title: 'Node 1',
    updatedAt: '2026-04-27T00:00:03.000Z'
  });

  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt: '2026-04-27T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: false,
    kind: 'topic',
    nodeId: 'node-1',
    parentNodeId: null,
    position: 0,
    reveal: null,
    title: 'Node 1',
    updatedAt: '2026-04-27T00:00:01.000Z'
  });

  expect(loadWorkspaceNodeDocument('node-1')).toMatchObject({
    content: 'new body',
    updatedAt: '2026-04-27T00:00:03.000Z'
  });
});
