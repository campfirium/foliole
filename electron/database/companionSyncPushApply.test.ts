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

import { applyCompanionSyncPush } from './companionSyncPushApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

type SyncPushPayload = import('./companionSyncPushApply.js').CompanionSyncPushPayload;

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

function insertBaseState(objectType: 'node_reading' | 'node_review', contentHash: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES (?, 'node-1', 1, ?, 'desktop', '2026-04-30T00:00:00.000Z', 0)`,
    [objectType, contentHash]
  );
}

function insertBaseReviewState(contentHash = 'desktop-base') {
  insertBaseState('node_review', contentHash);
}

function insertBaseReadingState(contentHash = 'desktop-reading-base') {
  insertBaseState('node_reading', contentHash);
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

function createReviewLogPush(opId = 'op-1'): SyncPushPayload {
  return {
    base: { kind: 'op_id', opId },
    clientOpId: `review_log:${opId}`,
    identity: { objectId: opId, objectType: 'review_log', scope: 'workspace' },
    payloadJson: JSON.stringify({
      device_id: 'android-device',
      difficulty_after: 3,
      difficulty_before: 2,
      due_after: '2026-05-01T00:00:00.000Z',
      due_before: '2026-04-30T00:00:00.000Z',
      grade: 3,
      id: `review-${opId}`,
      node_id: 'node-1',
      op_id: opId,
      reviewed_at: '2026-04-30T01:00:00.000Z',
      scheduler_version: 'ts-fsrs@4',
      stability_after: 4,
      stability_before: 3
    })
  };
}

describe('companion sync push apply', () => {
  it('accepts node_review when base content hash matches current desktop state', () => {
    insertBaseReviewState();

    const result = applyCompanionSyncPush([createNodeReviewPush()]);

    expect(result.appliedObjectIds).toEqual(['node_review:node-1']);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; sync_dirty: number }>(
      `SELECT content_hash, sync_dirty FROM sync_object_state
       WHERE object_type = 'node_review' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'android-next', sync_dirty: 0 });
  });

  it('accepts node_reading when base content hash matches current desktop state', () => {
    insertBaseReadingState();

    const result = applyCompanionSyncPush([createNodeReadingPush()]);

    expect(result.appliedObjectIds).toEqual(['node_reading:node-1']);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; sync_dirty: number }>(
      `SELECT content_hash, sync_dirty FROM sync_object_state
       WHERE object_type = 'node_reading' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'android-reading-next', sync_dirty: 0 });
    expect(openDatabaseConnection().driver.queryOne<{ reading_position: number }>(
      `SELECT reading_position FROM node_reading_device_state
       WHERE node_id = 'node-1' AND device_id = '*'`
    )).toEqual({ reading_position: 42 });
  });

  it('returns conflict for node_review when desktop base has changed', () => {
    insertBaseReviewState('desktop-newer');

    const result = applyCompanionSyncPush([createNodeReviewPush()]);

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.acks).toMatchObject([{
      conflictReason: 'base_content_hash_mismatch',
      stateSeq: 1,
      status: 'conflict'
    }]);
    expect(openDatabaseConnection().driver.queryOne<{ content_hash: string }>(
      `SELECT content_hash FROM sync_object_state
       WHERE object_type = 'node_review' AND object_id = 'node-1'`
    )).toEqual({ content_hash: 'desktop-newer' });
  });

  it('returns conflict for node_reading when desktop base has changed', () => {
    insertBaseReadingState('desktop-reading-newer');

    const result = applyCompanionSyncPush([createNodeReadingPush()]);

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

  it('treats repeated node_reading push as already applied', () => {
    insertBaseReadingState();
    applyCompanionSyncPush([createNodeReadingPush()]);

    const result = applyCompanionSyncPush([createNodeReadingPush()]);

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'already_applied' }]);
  });

  it('treats repeated node_review push as already applied', () => {
    insertBaseReviewState();
    applyCompanionSyncPush([createNodeReviewPush()]);

    const result = applyCompanionSyncPush([createNodeReviewPush()]);

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'already_applied' }]);
  });

  it('inserts review_log once and rejects mismatched duplicate op payloads', () => {
    const first = createReviewLogPush('op-1');
    const duplicate = createReviewLogPush('op-1');
    const conflicting = {
      ...createReviewLogPush('op-1'),
      payloadJson: JSON.stringify({ ...JSON.parse(first.payloadJson ?? '{}'), grade: 4 })
    };

    expect(applyCompanionSyncPush([first]).acks).toMatchObject([{ status: 'accepted' }]);
    expect(applyCompanionSyncPush([duplicate]).acks).toMatchObject([{ status: 'already_applied' }]);
    expect(applyCompanionSyncPush([conflicting]).acks).toMatchObject([{
      conflictReason: 'op_id_payload_mismatch',
      status: 'rejected'
    }]);
    expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_log WHERE op_id = ?',
      ['op-1']
    )).toEqual({ count: 1 });
  });
});
