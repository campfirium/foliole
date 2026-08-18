// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-watched-source-sync-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watched-source-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('syncs watched identity fields and preserves them when a mobile payload omits them', async () => {
  await applySyncObjectsAsync([sourceRecord({
    contentHash: 'desktop-hash',
    payload: {
      watched_binding_id: 'watched-source-1',
      watched_relative_path: 'folder/note.md'
    },
    updatedAt: '2026-08-18T01:00:00.000Z'
  })]);
  await applySyncObjectsAsync([sourceRecord({
    contentHash: 'mobile-hash',
    payload: {},
    updatedAt: '2026-08-18T02:00:00.000Z'
  })]);

  expect(openDatabaseConnection().driver.queryOne(
    `SELECT watched_binding_id, watched_relative_path FROM import_sources
     WHERE source_fingerprint = 'source-1'`
  )).toEqual({
    watched_binding_id: 'watched-source-1',
    watched_relative_path: 'folder/note.md'
  });
});

function sourceRecord(args: {
  contentHash: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}): NativeSyncObjectRecord {
  return {
    content_hash: args.contentHash,
    deleted_at: null,
    object_id: 'source-1',
    object_type: 'import_source',
    payload_json: JSON.stringify({
      first_imported_at: '2026-08-18T00:00:00.000Z',
      last_content_fingerprint: 'content-1',
      last_imported_at: args.updatedAt,
      provider: 'markdown',
      source_kind: 'file',
      source_locator: '/local/note.md',
      source_name: 'note.md',
      ...args.payload
    }),
    updated_at: args.updatedAt
  };
}
