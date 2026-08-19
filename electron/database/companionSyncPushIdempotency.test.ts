// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-push-idempotency-tests';

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
import type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-push-idempotency-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'item', 'Node', '', '2026-04-30T00:00:00.000Z', '2026-04-30T00:00:00.000Z')`
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createReviewLogPush(opId = 'op-1'): CompanionSyncPushPayload {
  return {
    authorHostName: 'android-device',
    base: { kind: 'op_id', opId },
    clientOpId: `review_log:${opId}`,
    identity: { objectId: opId, objectType: 'review_log', scope: 'workspace' },
    payloadJson: JSON.stringify({
      host_name: 'android-device', difficulty_after: 3, difficulty_before: 2,
      due_after: '2026-05-01T00:00:00.000Z', due_before: '2026-04-30T00:00:00.000Z', grade: 3,
      id: `review-${opId}`, node_id: 'node-1', op_id: opId, reviewed_at: '2026-04-30T01:00:00.000Z',
      scheduler_version: 'ts-fsrs@4', stability_after: 4, stability_before: 3
    })
  };
}

function createNodeReadingPush(): CompanionSyncPushPayload {
  return {
    authorHostName: 'android-device',
    base: { baseContentHash: 'desktop-reading-base', kind: 'content_hash' },
    clientOpId: 'node_reading:node-1:11',
    contentHash: 'android-reading-next',
    identity: { objectId: 'node-1', objectType: 'node_reading', scope: 'workspace' },
    payloadJson: JSON.stringify({
      interval_duration_ms: 120000, interval_growth_factor: 1.5,
      last_handled_at: '2026-04-30T01:00:00.000Z', next_at: '2026-05-01T00:00:00.000Z',
      priority: 3, reading_position: 42, repetition_count: 2, state: 'active'
    }),
    updatedAt: '2026-04-30T01:00:00.000Z'
  };
}

function createAlternativeTombstonePush(): CompanionSyncPushPayload {
  return {
    authorHostName: 'android-device',
    base: { baseContentHash: null, kind: 'content_hash' },
    clientOpId: 'node_text_alternative:alternative-1:11',
    contentHash: 'android-tombstone', deletedAt: '2026-04-30T01:00:00.000Z',
    identity: { objectId: 'alternative-1', objectType: 'node_text_alternative', scope: 'workspace' },
    payloadJson: null, updatedAt: '2026-04-30T01:00:00.001Z'
  };
}

it('treats a repeated node_reading push as already applied', async () => {
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node_reading', 'node-1', 1, 'desktop-reading-base', 'desktop', '2026-04-30T00:00:00.000Z', 0)`
  );
  await applyCompanionSyncPushAsync([createNodeReadingPush()], 'android-device');

  const result = await applyCompanionSyncPushAsync([createNodeReadingPush()], 'android-device');

  expect(result.appliedObjectIds).toEqual([]);
  expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'already_applied' }]);
});

it('confirms an alternative tombstone when the desktop already deleted that alternative', async () => {
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
       updated_at, deleted_at, sync_dirty
     ) VALUES ('node_text_alternative', 'alternative-1', 1, 'desktop-tombstone', 'desktop',
       '2026-04-30T00:00:00.001Z', '2026-04-30T00:00:00.000Z', 0)`
  );

  const result = await applyCompanionSyncPushAsync(
    [createAlternativeTombstonePush()], 'android-device'
  );

  expect(result.appliedObjectIds).toEqual([]);
  expect(result.acks).toMatchObject([{ stateSeq: 1, status: 'already_applied' }]);
});

it('inserts review_log once and rejects a mismatched duplicate operation payload', async () => {
  const first = createReviewLogPush();
  const duplicate = createReviewLogPush();
  const conflicting = {
    ...createReviewLogPush(),
    payloadJson: JSON.stringify({ ...JSON.parse(first.payloadJson ?? '{}'), grade: 4 })
  };

  await expect(applyCompanionSyncPushAsync([first], 'android-device')).resolves.toMatchObject({ acks: [{ status: 'accepted' }] });
  await expect(applyCompanionSyncPushAsync([duplicate], 'android-device')).resolves.toMatchObject({ acks: [{ status: 'already_applied' }] });
  await expect(applyCompanionSyncPushAsync([conflicting], 'android-device')).resolves.toMatchObject({
    acks: [{ conflictReason: 'op_id_payload_mismatch', status: 'rejected' }]
  });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM review_log WHERE op_id = ?', ['op-1']
  )).toEqual({ count: 1 });
});
