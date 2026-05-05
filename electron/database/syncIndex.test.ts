// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-index-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadSyncIndex } from './syncIndex.js';

let tempRoot = '';

async function initializeTestDatabase() {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-index-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  return openDatabaseConnection();
}

function insertNodeRecord(connection: ReturnType<typeof openDatabaseConnection>, params: {
  content: string;
  currentVersionId: string | null;
  id: string;
  title: string;
  updatedAt: string;
}) {
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, content, current_version_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      null,
      'item',
      params.title,
      params.content,
      params.currentVersionId,
      '2026-04-21T10:00:00.000Z',
      params.updatedAt
    ]
  );
}

function insertVersionRecord(connection: ReturnType<typeof openDatabaseConnection>) {
  connection.driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['desktop#2', 'node-1', 'desktop#1', 'desktop', '2026-04-21T11:00:00.000Z', 'hash-2']
  );
}

function insertSyncObjectState(connection: ReturnType<typeof openDatabaseConnection>) {
  connection.driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['external_document', 'folder-1:alpha.md', 'hash-external-alpha', 'desktop', '2026-04-21T12:00:00.000Z', 1]
  );
}

describe('loadSyncIndex', () => {
  beforeEach(async () => {
    await initializeTestDatabase();
  });

  afterEach(async () => {
    closeDatabaseConnection();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns current node sync pointers with content hash', () => {
    const connection = openDatabaseConnection();
    insertNodeRecord(connection, {
      content: 'hello',
      currentVersionId: 'desktop#2',
      id: 'node-1',
      title: 'Node 1',
      updatedAt: '2026-04-21T11:00:00.000Z'
    });
    insertVersionRecord(connection);
    insertNodeRecord(connection, {
      content: 'draft',
      currentVersionId: null,
      id: 'node-2',
      title: 'Node 2',
      updatedAt: '2026-04-21T12:30:00.000Z'
    });
    insertSyncObjectState(connection);

    expect(loadSyncIndex()).toEqual([
      {
        content_hash: 'hash-2',
        object_id: 'node-1',
        object_type: 'node',
        sync_version_id: 'desktop#2',
        updated_at: '2026-04-21T11:00:00.000Z'
      },
      {
        content_hash: 'hash-external-alpha',
        object_id: 'folder-1:alpha.md',
        object_type: 'external_document',
        sync_version_id: null,
        updated_at: '2026-04-21T12:00:00.000Z'
      },
      {
        content_hash: null,
        object_id: 'node-2',
        object_type: 'node',
        sync_version_id: null,
        updated_at: '2026-04-21T12:30:00.000Z'
      }
    ]);
  });
});
