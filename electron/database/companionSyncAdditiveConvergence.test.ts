// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-additive-convergence-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-additive-convergence-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('parent', 'topic', 'Parent', 'Selected text',
       '2026-05-03T00:00:00.000Z', '2026-05-03T00:00:00.000Z')`
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createHighlightPush(anchorId: string, versionId: string): CompanionSyncPushPayload {
  const updatedAt = versionId === 'android#local'
    ? '2026-05-03T01:00:00.000Z'
    : '2026-05-03T02:00:00.000Z';
  const record: NativeSyncNodeRecord = {
    ancestor_version_ids: [],
    content_hash: `hash:${versionId}`,
    host_name: versionId.slice(0, versionId.indexOf('#')),
    object_id: 'highlight-1',
    object_type: 'node',
    parent_version_id: null,
    parent_version_ids: [],
    snapshot: {
      anchor_link: JSON.stringify({ id: anchorId, kind: 'highlight' }),
      attachments: [],
      content: 'Selected text',
      created_at: updatedAt,
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'highlight-1',
      image_regions: null,
      is_title_manual: false,
      kind: 'topic',
      opening_text: null,
      parent_id: 'parent',
      position: null,
      priority: null,
      reveal: null,
      title: 'Selected text',
      updated_at: updatedAt,
      virtual_filter: null
    },
    updated_at: updatedAt,
    version_created_at: updatedAt,
    version_id: versionId
  };
  return {
    authorHostName: record.host_name!,
    base: { ancestorVersionIds: [], kind: 'node_version', parentVersionId: null, parentVersionIds: [] },
    clientOpId: `node:${versionId}`,
    contentHash: record.content_hash!,
    identity: { objectId: record.object_id, objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(record),
    updatedAt
  };
}

it('deduplicates an exact additive object collision', async () => {
  await applyCompanionSyncPushAsync([createHighlightPush('anchor-shared', 'android#local')], 'android');

  const result = await applyCompanionSyncPushAsync([createHighlightPush('anchor-shared', 'ios#remote')], 'ios');

  expect(result.acks).toMatchObject([{ status: 'accepted' }]);
  expect(result.acks[0]?.canonicalObjectId).toBeUndefined();
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'highlight-1%'`
  )).toEqual({ count: 1 });
});

it('preserves both additive objects under a stable canonical id', async () => {
  await applyCompanionSyncPushAsync([createHighlightPush('anchor-local', 'android#local')], 'android');
  const incoming = createHighlightPush('anchor-remote', 'ios#remote');

  const first = await applyCompanionSyncPushAsync([incoming], 'ios');
  const canonicalId = first.acks[0]?.canonicalObjectId;

  expect(canonicalId).toMatch(/^highlight-1~[0-9a-f]{12}$/u);
  expect(first.acks).toMatchObject([{ status: 'accepted', versionId: 'ios#remote' }]);
  expect(openDatabaseConnection().driver.queryAll<{ anchor_link: string; id: string }>(
    `SELECT id, anchor_link FROM nodes WHERE id LIKE 'highlight-1%' ORDER BY id`
  )).toEqual([
    { anchor_link: '{"id":"anchor-local","kind":"highlight"}', id: 'highlight-1' },
    { anchor_link: '{"id":"anchor-remote","kind":"highlight"}', id: canonicalId }
  ]);

  const replay = await applyCompanionSyncPushAsync([incoming], 'ios');
  expect(replay.acks[0]?.canonicalObjectId).toBe(canonicalId);
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'highlight-1%'`
  )).toEqual({ count: 2 });
});
