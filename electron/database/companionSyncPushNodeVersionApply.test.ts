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

import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

type SyncPushPayload = import('./companionSyncPushTypes.js').CompanionSyncPushPayload;
type SyncNodeRecord = import('../../lib/platform/nativeSyncContract.js').NativeSyncNodeRecord;

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

function createRestoreNodeVersionPush(parentVersionId = 'desktop#deleted'): SyncPushPayload {
  const payload = createNodeVersionPush();
  const record = JSON.parse(payload.payloadJson!) as SyncNodeRecord;
  const restoredAt = '2026-05-03T02:00:00.000Z';
  Object.assign(record, {
    ancestor_version_ids: [parentVersionId],
    object_id: 'node-restored',
    parent_version_id: parentVersionId,
    updated_at: restoredAt,
    version_created_at: restoredAt,
    version_id: 'ios#restore'
  });
  Object.assign(record.snapshot, {
    deleted_at: null,
    id: 'node-restored',
    parent_id: null,
    updated_at: restoredAt
  });
  return {
    ...payload,
    base: { ancestorVersionIds: [parentVersionId], kind: 'node_version', parentVersionId },
    clientOpId: 'node:ios#restore',
    identity: { objectId: 'node-restored', objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(record),
    updatedAt: restoredAt
  };
}

function seedDeletedNode() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, deleted_at, created_at, updated_at)
     VALUES ('node-restored', 'topic', 'Deleted', '', '2026-05-03T01:00:00.000Z',
       '2026-05-03T00:00:00.000Z', '2026-05-03T01:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#stale', 'node-restored', NULL, 'desktop',
       '2026-05-03T00:30:00.000Z', 'desktop-stale-hash', '{}')`
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#deleted', 'node-restored', 'desktop#stale', 'desktop',
       '2026-05-03T01:00:00.000Z', 'desktop-deleted-hash', '{}')`
  );
  driver.execute(
    `UPDATE nodes SET current_version_id = 'desktop#deleted' WHERE id = 'node-restored'`
  );
}

describe('companion sync node version push apply', () => {
  it('accepts Android-created node versions into desktop nodes and version history', async () => {
    const result = await applyCompanionSyncPushAsync([createNodeVersionPush()], 'android-device');

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
    const result = await applyCompanionSyncPushAsync([createNodeVersionPush()], 'android-device');

    expect(result.appliedNodeIds).toEqual(['node-highlight']);
    expect(result.acks).toMatchObject([{
      status: 'accepted',
      versionId: 'android#1'
    }]);
    expect(openDatabaseConnection().driver.queryOne<{ current_version_id: string }>(
      `SELECT current_version_id FROM nodes WHERE id = 'node-highlight'`
    )).toEqual({ current_version_id: 'android#1' });
  });

  it('accepts only a direct child version as an intentional companion restore', async () => {
    seedDeletedNode();

    const result = await applyCompanionSyncPushAsync([createRestoreNodeVersionPush()], 'android-device');

    expect(result.acks).toMatchObject([{ status: 'accepted', versionId: 'ios#restore' }]);
    expect(openDatabaseConnection().driver.queryOne<{ current_version_id: string; deleted_at: null }>(
      `SELECT current_version_id, deleted_at FROM nodes WHERE id = 'node-restored'`
    )).toEqual({ current_version_id: 'ios#restore', deleted_at: null });
  });

  it('keeps stale companion restore ancestry on the conflict path', async () => {
    seedDeletedNode();

    const result = await applyCompanionSyncPushAsync(
      [createRestoreNodeVersionPush('desktop#stale')], 'android-device'
    );

    expect(result.acks).toMatchObject([{ status: 'conflict' }]);
    expect(openDatabaseConnection().driver.queryOne<{ current_version_id: string; deleted_at: string }>(
      `SELECT current_version_id, deleted_at FROM nodes WHERE id = 'node-restored'`
    )).toEqual({ current_version_id: 'desktop#deleted', deleted_at: '2026-05-03T01:00:00.000Z' });
  });
});
