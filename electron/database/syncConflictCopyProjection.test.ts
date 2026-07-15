// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

let mockedAppDataDir = '/tmp/foliole-sync-conflict-copy-projection-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertConflictCopyProjection } from './syncConflictCopyProjection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-conflict-copy-projection-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function nodeRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'hash-1',
    device_id: 'phone',
    object_id: 'node-source',
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Remote body',
      created_at: '2026-05-21T00:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      enable_short_term: null,
      sequential_reading_enabled: true,
      hide_title_heading: false,
      id: 'node-source',
      image_regions: null,
      import_content_fingerprint: 'content-source',
      import_source_fingerprint: 'source-source',
      is_title_manual: true,
      kind: 'topic',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: 'Remote node',
      updated_at: '2026-05-21T00:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-21T00:00:00.000Z',
    version_created_at: '2026-05-21T00:00:00.000Z',
    version_id: 'phone#1'
  };
}

it('preserves sequential reading settings on conflict copy projections', () => {
  upsertConflictCopyProjection({
    copyNodeId: 'conflict-copy-node',
    driver: openDatabaseConnection().driver,
    placeAtTop: false,
    record: nodeRecord(),
    sourceVersionId: 'phone#1',
    timestamp: '2026-05-21T00:05:00.000Z'
  });

  expect(openDatabaseConnection().sqlite
    .prepare(`SELECT sequential_reading_enabled, import_source_fingerprint,
                    import_content_fingerprint
              FROM nodes WHERE id = ?`)
    .get('conflict-copy-node')).toEqual({
      import_content_fingerprint: null,
      import_source_fingerprint: null,
      sequential_reading_enabled: 1
    });
  const version = openDatabaseConnection().sqlite
    .prepare('SELECT snapshot_json FROM node_sync_versions WHERE object_id = ?')
    .get('conflict-copy-node') as { snapshot_json: string };
  expect(JSON.parse(version.snapshot_json)).toMatchObject({
    import_content_fingerprint: null,
    import_source_fingerprint: null,
    sequential_reading_enabled: true
  });
});
