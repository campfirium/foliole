// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-node-version-push-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { applyCompanionSyncPush } from './companionSyncPushApply.js';
import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

type SyncPushPayload = import('./companionSyncPushApply.js').CompanionSyncPushPayload;

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-node-version-push-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('parent', 'topic', 'Parent', '', '2026-05-03T00:00:00.000Z', '2026-05-03T00:00:00.000Z')`
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createNodeVersionPush(): SyncPushPayload {
  const record = {
    ancestor_version_ids: [],
    content_hash: 'android-node-hash',
    device_id: 'android-device',
    object_id: 'node-highlight',
    object_type: 'node' as const,
    parent_version_id: null,
    snapshot: {
      anchor_link: '{"id":"anchor-1","kind":"highlight"}',
      attachments: [],
      content: 'Selected text',
      created_at: '2026-05-03T01:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'node-highlight',
      image_regions: null,
      is_title_manual: false,
      kind: 'topic',
      opening_text: null,
      parent_id: 'parent',
      position: null,
      priority: null,
      reveal: null,
      title: 'Selected text',
      updated_at: '2026-05-03T01:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-03T01:00:00.000Z',
    version_created_at: '2026-05-03T01:00:00.000Z',
    version_id: 'android#1'
  };
  return {
    base: { ancestorVersionIds: [], kind: 'node_version', parentVersionId: null },
    clientOpId: 'node:android#1',
    contentHash: 'android-node-hash',
    identity: { objectId: 'node-highlight', objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(record),
    updatedAt: '2026-05-03T01:00:00.000Z'
  };
}

describe('companion sync node version push apply', () => {
  it('accepts Android-created node versions into desktop nodes and version history', () => {
    const result = applyCompanionSyncPush([createNodeVersionPush()]);

    expect(result.appliedNodeIds).toEqual(['node-highlight']);
    expect(result.acks).toMatchObject([{
      identity: { objectId: 'node-highlight', objectType: 'node', scope: 'workspace' },
      status: 'accepted',
      versionId: 'android#1'
    }]);
    expect(openDatabaseConnection().driver.queryOne<{ anchor_link: string; current_version_id: string; title: string }>(
      `SELECT anchor_link, current_version_id, title FROM nodes WHERE id = 'node-highlight'`
    )).toEqual({
      anchor_link: '{"id":"anchor-1","kind":"highlight"}',
      current_version_id: 'android#1',
      title: 'Selected text'
    });
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; device_id: string }>(
      `SELECT content_hash, device_id FROM node_sync_versions WHERE version_id = 'android#1'`
    )).toEqual({ content_hash: 'android-node-hash', device_id: 'android-device' });
  });

  it('accepts node versions through the async companion push entry', async () => {
    const result = await applyCompanionSyncPushAsync([createNodeVersionPush()]);

    expect(result.appliedNodeIds).toEqual(['node-highlight']);
    expect(result.acks).toMatchObject([{
      status: 'accepted',
      versionId: 'android#1'
    }]);
    expect(openDatabaseConnection().driver.queryOne<{ current_version_id: string }>(
      `SELECT current_version_id FROM nodes WHERE id = 'node-highlight'`
    )).toEqual({ current_version_id: 'android#1' });
  });
});
