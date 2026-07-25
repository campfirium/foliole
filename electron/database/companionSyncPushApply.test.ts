// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-push-apply-tests';

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

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-push-apply-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertNode('node-1');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-30T00:00:00.000Z', '2026-04-30T00:00:00.000Z']
  );
}

function insertBaseState(objectType: 'node_open_state' | 'node_reading' | 'node_review' | 'setting' | 'view_state', objectId: string, contentHash: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES (?, ?, 1, ?, 'desktop', '2026-04-30T00:00:00.000Z', 0)`,
    [objectType, objectId, contentHash]
  );
}

function createNodeOpenStatePush(lastOpenedAt: string, overrides: Partial<SyncPushPayload> = {}): SyncPushPayload {
  return {
    base: { baseContentHash: 'stale-companion-base', kind: 'content_hash' },
    clientOpId: `node_open_state:node-1:${lastOpenedAt}`,
    contentHash: `hash-${lastOpenedAt}`,
    deletedAt: null,
    identity: { objectId: 'node-1', objectType: 'node_open_state', scope: 'workspace' },
    payloadJson: JSON.stringify({ last_opened_at: lastOpenedAt, node_id: 'node-1' }),
    updatedAt: lastOpenedAt,
    ...overrides
  };
}

function insertBaseReviewState(contentHash = 'desktop-base') {
  insertBaseState('node_review', 'node-1', contentHash);
}

function insertBaseReadingState(contentHash = 'desktop-reading-base') {
  insertBaseState('node_reading', 'node-1', contentHash);
}

function createNodeReadingPush(overrides: Partial<SyncPushPayload> = {}): SyncPushPayload {
  return {
    base: { baseContentHash: 'desktop-reading-base', kind: 'content_hash' },
    clientOpId: 'node_reading:node-1:11',
    contentHash: 'android-reading-next',
    deletedAt: null,
    identity: { objectId: 'node-1', objectType: 'node_reading', scope: 'workspace' },
    payloadJson: JSON.stringify({
      interval_duration_ms: 120000,
      interval_growth_factor: 1.5,
      last_handled_at: '2026-04-30T01:00:00.000Z',
      next_at: '2026-05-01T00:00:00.000Z',
      priority: 3,
      reading_position: 42,
      repetition_count: 2,
      state: 'active'
    }),
    updatedAt: '2026-04-30T01:00:00.000Z',
    ...overrides
  };
}

function createNodeReviewPush(overrides: Partial<SyncPushPayload> = {}): SyncPushPayload {
  return {
    base: { baseContentHash: 'desktop-base', kind: 'content_hash' },
    clientOpId: 'node_review:node-1:12',
    contentHash: 'android-next',
    deletedAt: null,
    identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
    payloadJson: JSON.stringify({
      difficulty: 2,
      due: '2026-05-01T00:00:00.000Z',
      elapsed_days: 0,
      lapses: 0,
      last_review_at: '2026-04-30T01:00:00.000Z',
      reps: 1,
      scheduled_days: 1,
      stability: 3,
      state: 1
    }),
    updatedAt: '2026-04-30T01:00:00.000Z',
    ...overrides
  };
}

describe('companion sync push apply', () => {
  it('accepts node_review when base content hash matches current desktop state', async () => {
    insertBaseReviewState();

    const result = await applyCompanionSyncPushAsync([createNodeReviewPush()]);

    expect(result.appliedObjectIds).toEqual(['node_review:node-1']);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; sync_dirty: number }>(
      `SELECT content_hash, sync_dirty FROM sync_object_state
       WHERE object_type = 'node_review' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'android-next', sync_dirty: 0 });
  });

  it('accepts node_review create attempts when desktop has no current state', async () => {
    const result = await applyCompanionSyncPushAsync([createNodeReviewPush({
      base: { baseContentHash: null, kind: 'content_hash' }
    })]);

    expect(result.appliedObjectIds).toEqual(['node_review:node-1']);
    expect(result.acks).toMatchObject([{ stateSeq: 1, status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; sync_dirty: number }>(
      `SELECT content_hash, sync_dirty FROM sync_object_state
       WHERE object_type = 'node_review' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'android-next', sync_dirty: 0 });
  });

  it('accepts node_reading when base content hash matches current desktop state', async () => {
    insertBaseReadingState();

    const result = await applyCompanionSyncPushAsync([createNodeReadingPush()]);

    expect(result.appliedObjectIds).toEqual(['node_reading:node-1']);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; sync_dirty: number }>(
      `SELECT content_hash, sync_dirty FROM sync_object_state
       WHERE object_type = 'node_reading' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'android-reading-next', sync_dirty: 0 });
    expect(openDatabaseConnection().driver.queryOne<{ reading_position: number }>(
      `SELECT reading_position FROM node_reading_device_state
       WHERE node_id = 'node-1'`
    )).toBeUndefined();
  });

});

describe('companion sync push conflict handling', () => {
  it('merges node open state by the latest timestamp instead of conflicting on a stale base', async () => {
    insertBaseState('node_open_state', 'node-1', 'desktop-open-base');
    openDatabaseConnection().driver.execute(
      "INSERT INTO node_open_state (node_id, last_opened_at) VALUES ('node-1', '2026-04-30T00:00:00.000Z')"
    );

    const result = await applyCompanionSyncPushAsync([
      createNodeOpenStatePush('2026-04-30T02:00:00.000Z')
    ]);

    expect(result.acks).toMatchObject([{ status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ last_opened_at: string }>(
      "SELECT last_opened_at FROM node_open_state WHERE node_id = 'node-1'"
    )).toEqual({ last_opened_at: '2026-04-30T02:00:00.000Z' });
  });

  it('keeps the newer desktop open fact when a stale-base companion fact is older', async () => {
    insertBaseState('node_open_state', 'node-1', 'desktop-open-base');
    openDatabaseConnection().driver.execute(
      "UPDATE sync_object_state SET updated_at = '2026-04-30T03:00:00.000Z' WHERE object_type = 'node_open_state'"
    );
    openDatabaseConnection().driver.execute(
      "INSERT INTO node_open_state (node_id, last_opened_at) VALUES ('node-1', '2026-04-30T03:00:00.000Z')"
    );

    const result = await applyCompanionSyncPushAsync([
      createNodeOpenStatePush('2026-04-30T02:00:00.000Z')
    ]);

    expect(result.acks).toMatchObject([{ status: 'already_applied' }]);
    expect(openDatabaseConnection().driver.queryOne<{ last_opened_at: string }>(
      "SELECT last_opened_at FROM node_open_state WHERE node_id = 'node-1'"
    )).toEqual({ last_opened_at: '2026-04-30T03:00:00.000Z' });
  });

  it('accepts the first actual node review even when its base hash has changed', async () => {
    insertBaseReviewState('desktop-newer');

    const result = await applyCompanionSyncPushAsync([createNodeReviewPush()]);

    expect(result.appliedObjectIds).toEqual(['node_review:node-1']);
    expect(result.acks).toMatchObject([{ status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string }>(
      `SELECT content_hash FROM sync_object_state
       WHERE object_type = 'node_review' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'android-next' });
  });

  it('returns conflict for node_reading when desktop base has changed', async () => {
    insertBaseReadingState('desktop-reading-newer');

    const result = await applyCompanionSyncPushAsync([createNodeReadingPush()]);

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.acks).toMatchObject([{
      conflictReason: 'base_content_hash_mismatch',
      stateSeq: 1,
      status: 'conflict'
    }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string }>(
      `SELECT content_hash FROM sync_object_state
       WHERE object_type = 'node_reading' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'desktop-reading-newer' });
  });

});
