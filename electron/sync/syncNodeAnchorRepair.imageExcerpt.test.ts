// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-image-excerpt-repair-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-image-excerpt-repair-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('preserves local image excerpt regions while repairing the occurrence locator', async () => {
  const image = '![Cover](asset://hash-1.png)';
  const imageRegions = JSON.stringify([{
    attachmentId: 'hash-1',
    regions: [{ height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.4 }]
  }]);
  insertNode('parent-1', null, image, null, 'desktop#parent-v1');
  insertNode('child-1', 'parent-1', 'Excerpt', JSON.stringify({
    id: 'excerpt-1', kind: 'image-excerpt',
    locator: { from: 0, originalText: image, to: image.length }
  }));
  openDatabaseConnection().sqlite.prepare('UPDATE nodes SET image_regions = ? WHERE id = ?').run(imageRegions, 'child-1');

  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'sync-image-excerpt-repair-test' });
  await applySyncNodesWithDbPort(port, [parentRecord(`Lead\n${image}`)]);
  const child = openDatabaseConnection().sqlite.prepare(
    'SELECT anchor_link, image_regions FROM nodes WHERE id = ?'
  ).get('child-1') as { anchor_link: string; image_regions: string };

  expect(JSON.parse(child.anchor_link).locator).toMatchObject({ from: 5, originalText: image });
  expect(child.image_regions).toBe(imageRegions);
});

function insertNode(id: string, parentId: string | null, content: string, anchorLink: string | null, versionId = `desktop#${id}-v1`) {
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, title, content, anchor_link, current_version_id,
       last_modified_by_host_name, sync_dirty, created_at, updated_at
     ) VALUES (?, ?, 'topic', ?, ?, ?, ?, 'desktop', 0, ?, ?)`
  ).run(id, parentId, id, content, anchorLink, versionId, '2026-05-10T07:00:00.000Z', '2026-05-10T07:00:00.000Z');
}

function parentRecord(content: string): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#parent-v1'],
    content_hash: 'phone#parent-v2-hash',
    host_name: 'phone',
    object_id: 'parent-1',
    object_type: 'node',
    parent_version_id: 'desktop#parent-v1',
    snapshot: {
      anchor_link: null, attachments: [], content, created_at: '2026-05-10T07:00:00.000Z',
      deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'parent-1',
      image_regions: null, is_title_manual: true, kind: 'topic', opening_text: null,
      parent_id: null, position: 0, priority: null, reveal: null, title: 'parent-1',
      updated_at: '2026-05-10T08:00:00.000Z', virtual_filter: null
    },
    updated_at: '2026-05-10T08:00:00.000Z',
    version_created_at: '2026-05-10T08:00:00.000Z',
    version_id: 'phone#parent-v2'
  };
}
