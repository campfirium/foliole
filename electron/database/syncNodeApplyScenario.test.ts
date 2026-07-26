// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-node-apply-scenario-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncNodesAsync } from './syncApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-node-apply-scenario-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('covers highlight child apply, idempotency, and divergent remote conflict isolation', async () => {
  await expect(applySyncNodesAsync([
    nodeRecord({ id: 'parent-1', title: 'Parent Topic', versionId: 'phone#parent-1' }),
    nodeRecord({
      id: 'highlight-1',
      parentId: 'parent-1',
      title: 'Highlighted passage',
      versionId: 'phone#highlight-1',
      anchorLink: JSON.stringify({ id: 'anchor-1', kind: 'highlight' })
    })
  ])).resolves.toEqual(['parent-1', 'highlight-1']);
  await expect(applySyncNodesAsync([nodeRecord({
    id: 'highlight-1',
    parentId: 'parent-1',
    title: 'Highlighted passage',
    versionId: 'phone#highlight-1',
    anchorLink: JSON.stringify({ id: 'anchor-1', kind: 'highlight' })
  })])).resolves.toEqual([]);

  insertDivergentLocalNode();
  await expect(applySyncNodesAsync([nodeRecord({
    id: 'conflict-node',
    title: 'Remote conflict branch',
    versionId: 'phone#conflict-1'
  })])).resolves.toEqual([]);

  const connection = openDatabaseConnection();
  expect(connection.sqlite.prepare(
    `SELECT parent_id, title, anchor_link, sync_dirty
     FROM nodes WHERE id = 'highlight-1'`
  ).get()).toEqual({
    anchor_link: '{"id":"anchor-1","kind":"highlight"}',
    parent_id: 'parent-1',
    sync_dirty: 0,
    title: 'Highlighted passage'
  });
  expect(connection.sqlite.prepare(
    `SELECT title, content, current_version_id FROM nodes WHERE id = 'conflict-node'`
  ).get()).toEqual({
    content: 'local body',
    current_version_id: 'desktop#2',
    title: 'Local conflict branch'
  });
  expect(connection.sqlite.prepare(
    `SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'conflict-copy-%'`
  ).get()).toEqual({ count: 0 });
});

function nodeRecord(args: {
  anchorLink?: string | null;
  id: string;
  parentId?: string | null;
  title: string;
  versionId: string;
}): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#0'],
    content_hash: `${args.id}-hash`,
    device_id: 'phone',
    object_id: args.id,
    object_type: 'node',
    parent_version_id: 'desktop#0',
    snapshot: {
      anchor_link: args.anchorLink ?? null,
      attachments: [],
      content: `${args.title} body`,
      created_at: '2026-05-04T07:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: args.id,
      image_regions: null,
      is_title_manual: true,
      kind: 'topic',
      opening_text: null,
      parent_id: args.parentId ?? null,
      position: 0,
      priority: null,
      reveal: null,
      title: args.title,
      updated_at: '2026-05-04T07:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-04T07:00:00.000Z',
    version_created_at: '2026-05-04T07:00:00.000Z',
    version_id: args.versionId
  };
}

function insertDivergentLocalNode() {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at
     ) VALUES ('conflict-node', 'topic', 'Local conflict branch', 'local body',
       'desktop#2', 'desktop', 0, '2026-05-04T06:00:00.000Z', '2026-05-04T06:00:00.000Z')`
  );
}
