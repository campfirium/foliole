import { beforeEach, expect, it } from 'vitest';

import { COMPANION_SYNCBACK_HOST_CONTRACT as CONTRACT } from '../../../../../../lib/core/database/companionSyncbackHostContractDefinitions';
import type { DbParams, DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

import { createCompanionSyncbackDbStore } from './companionSyncbackDbStore';

let fake: FakeDbPort;

beforeEach(() => {
  fake = new FakeDbPort();
});

it('selects only supported local state through the shared macOS payload contract', async () => {
  const settingPayloadJson = JSON.stringify({
    device_id: '*', form_factor: 'phone', key: 'handoff_reminder_settings',
    platform: 'ios', scope: 'device', value_json: '{"enabled":true}'
  });
  fake.meta.set('device_id', 'ios-device');
  fake.stateRows = [
    stateRow('node_open_state', 'open-hash', 3),
    stateRow('node_reading', 'reading-hash', 4),
    stateRow('node_review', 'review-hash', 5),
    stateRow('setting', 'setting-hash', 6, 'device:ios:phone:*:handoff_reminder_settings')
  ];
  fake.openStatePayloadRows = [{
    payload_json: JSON.stringify({
      last_opened_at: '2026-07-20T00:00:00.000Z', node_id: 'node-1'
    })
  }];
  fake.readingPayloadRows = [{
    interval_duration_ms: 120000, interval_growth_factor: 1.5,
    last_handled_at: '2026-07-20T00:00:00.000Z', next_at: '2026-07-21T00:00:00.000Z',
    node_id: 'node-1', priority: 3, repetition_count: 2, state: 'active'
  }];
  fake.reviewPayloadRows = [{
    difficulty: 3.2, due: '2026-07-22T00:00:00.000Z', elapsed_days: 1, lapses: 0,
    last_review_at: '2026-07-20T00:00:00.000Z', node_id: 'node-1', reps: 2,
    scheduled_days: 2, stability: 4.1, state: 2
  }];
  fake.settingPayloadRows = [{ payload_json: settingPayloadJson }];
  fake.reviewRows = [reviewRow('ios-device', 'op-1'), reviewRow('other-device', 'op-2')];
  const store = createCompanionSyncbackDbStore(fake);

  await expect(store.loadStateChanges('desktop-peer', null, 20)).resolves.toEqual([
    expect.objectContaining({
      object_type: 'node_open_state', payload_json: fake.openStatePayloadRows[0]!.payload_json
    }),
    expect.objectContaining({ object_type: 'node_reading', payload_json: JSON.stringify(fake.readingPayloadRows[0]) }),
    expect.objectContaining({ object_type: 'node_review', payload_json: JSON.stringify(fake.reviewPayloadRows[0]) }),
    expect.objectContaining({ object_type: 'setting', payload_json: settingPayloadJson })
  ]);
  await expect(store.loadReviewLog('desktop-peer', null, 20)).resolves.toEqual([reviewRow('ios-device', 'op-1')]);
  expect(fake.queries).toContainEqual([CONTRACT.sql.state, [0, 'desktop-peer', 20]]);
  expect(fake.queries).toContainEqual([CONTRACT.sql.readingPayload, ['node-1']]);
  expect(fake.queries).toContainEqual([CONTRACT.sql.reviewPayload, ['node-1']]);
  expect(fake.queries).toContainEqual([
    CONTRACT.sql.settingPayload, ['device:ios:phone:*:handoff_reminder_settings']
  ]);
});

it('pushes an alternative under a deleted node as a tombstone', async () => {
  const deletedAt = '2026-07-21T00:00:00.000Z';
  fake.stateRows = [stateRow('node_text_alternative', 'alternative-hash', 7, 'alternative-1')];
  fake.alternativeNodeDeletionRows = [{ deleted_at: deletedAt }];

  await expect(createCompanionSyncbackDbStore(fake)
    .loadStateChanges('desktop-peer', null, 20)).resolves.toEqual([
    expect.objectContaining({
      deleted_at: deletedAt,
      object_id: 'alternative-1',
      object_type: 'node_text_alternative',
      payload_json: null
    })
  ]);
  expect(CONTRACT.sql.state).toContain("'node_text_alternative'");
  expect(fake.queries).toContainEqual([CONTRACT.sql.alternativeNodeDeletion, ['alternative-1']]);
});

it('loads local node versions with shared ordering and ancestor semantics', async () => {
  fake.meta.set('device_id', 'ios-device');
  fake.nodeRows = [{
    content_hash: 'node-hash', device_id: 'ios-device', is_tombstone: 0,
    object_id: 'node-1', object_type: 'node', parent_version_id: 'desktop#1',
    snapshot: JSON.stringify({ id: 'node-1', title: 'iPhone note' }),
    updated_at: '2026-07-21T00:00:00.000Z', version_created_at: '2026-07-21T00:00:00.000Z',
    version_id: 'ios-device#1'
  }];
  fake.nodeParents.set('ios-device#1', 'desktop#1');
  const store = createCompanionSyncbackDbStore(fake);

  await expect(store.loadNodeVersions('desktop-peer', null, 20)).resolves.toEqual([expect.objectContaining({
    ancestor_version_ids: ['desktop#1'],
    is_tombstone: false,
    snapshot: { id: 'node-1', title: 'iPhone note' },
    version_id: 'ios-device#1'
  })]);
  expect(fake.queries).toContainEqual([
    CONTRACT.sql.nodeVersions,
    ['ios-device', 'desktop-peer', '', '', '', '', '', 20]
  ]);
});

it('rejects malformed local node snapshots before they reach the Mac push protocol', async () => {
  fake.meta.set('device_id', 'ios-device');
  fake.nodeRows = [{
    is_tombstone: 0,
    snapshot: 'not-json',
    version_id: 'ios-device#broken'
  }];

  await expect(createCompanionSyncbackDbStore(fake).loadNodeVersions('desktop-peer', null, 20))
    .rejects.toThrow('invalid_companion_node_version_snapshot');
});

it('persists cursors and saves valid acknowledgements atomically', async () => {
  const store = createCompanionSyncbackDbStore(fake);
  const cursor = { change_id: 'op-1', created_at: '2026-07-20T00:00:00.000Z' };

  await store.saveStatePushCursor(5);
  await store.saveNodeVersionPushCursor(cursor);
  await store.saveReviewLogPushCursor(cursor);
  await expect(store.loadStatePushCursor()).resolves.toBe(5);
  await expect(store.loadNodeVersionPushCursor()).resolves.toEqual(cursor);
  await expect(store.loadReviewLogPushCursor()).resolves.toEqual(cursor);
  await expect(store.savePushAcks('desktop-peer', [
    ack('reading-state', 'node_reading', 'node-1', 'accepted', 4),
    ack('review-state', 'node_review', 'node-1', 'accepted', 5),
    ack('review-log', 'review_log', 'op-1', 'accepted')
  ])).resolves.toEqual(['reading-state', 'review-state', 'review-log']);
  expect(fake.acks.map((row) => row.clientOpId)).toEqual(['reading-state', 'review-state', 'review-log']);

  fake.failClientOpId = 'second';
  await expect(store.savePushAcks('desktop-peer', [
    ack('first', 'node_reading', 'node-2', 'conflict'),
    ack('second', 'node_review', 'node-3', 'rejected')
  ])).rejects.toThrow('forced_ack_failure');
  expect(fake.acks.map((row) => row.clientOpId)).toEqual(['reading-state', 'review-state', 'review-log']);
});

function stateRow(
  objectType: 'node_open_state' | 'node_reading' | 'node_review' | 'node_text_alternative' | 'setting',
  contentHash: string,
  stateSeq: number,
  objectId = 'node-1'
) {
  return {
    base_content_hash: 'base-hash', content_hash: contentHash, deleted_at: null,
    object_id: objectId, object_type: objectType, state_seq: stateSeq,
    updated_at: '2026-07-20T00:00:00.000Z'
  };
}

function reviewRow(deviceId: string, opId: string) {
  return {
    device_id: deviceId, difficulty_after: 3.2, difficulty_before: 3.1,
    due_after: '2026-07-22T00:00:00.000Z', due_before: '2026-07-20T00:00:00.000Z',
    grade: 3, id: `id-${opId}`, node_id: 'node-1', op_id: opId,
    reviewed_at: '2026-07-20T00:00:00.000Z', scheduler_version: 'ts-fsrs@4',
    stability_after: 4.1, stability_before: 2.1
  };
}

function ack(
  clientOpId: string,
  objectType: 'node_reading' | 'node_review' | 'review_log',
  objectId: string,
  status: 'accepted' | 'conflict' | 'rejected',
  stateSeq?: number
) {
  return {
    clientOpId,
    identity: { objectId, objectType, scope: 'workspace' },
    ...(stateSeq === undefined ? {} : { stateSeq }),
    status
  } as const;
}

class FakeDbPort implements DbPort {
  readonly meta = new Map<string, string>();
  readonly queries: Array<[string, DbParams]> = [];
  acks: Array<{ clientOpId: string; objectId: string; objectType: string }> = [];
  alternativeNodeDeletionRows: DbRow[] = [];
  failClientOpId: string | null = null;
  nodeParents = new Map<string, string>();
  nodeRows: DbRow[] = [];
  openStatePayloadRows: DbRow[] = [];
  readingPayloadRows: DbRow[] = [];
  reviewPayloadRows: DbRow[] = [];
  reviewRows: DbRow[] = [];
  settingPayloadRows: DbRow[] = [];
  stateRows: DbRow[] = [];

  async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    this.queries.push([sql, params]);
    if (sql === CONTRACT.sql.metaQuery) {
      const value = this.meta.get(String(params[0]));
      return (value === undefined ? [] : [{ value }]) as unknown as T[];
    }
    if (sql === CONTRACT.sql.nodeVersions) return this.nodeRows as T[];
    if (sql === CONTRACT.sql.alternativeNodeDeletion) return this.alternativeNodeDeletionRows as T[];
    if (sql === CONTRACT.sql.nodeVersionParent) {
      const parentVersionId = this.nodeParents.get(String(params[0]));
      return (parentVersionId ? [{ parent_version_id: parentVersionId }] : []) as unknown as T[];
    }
    if (sql === CONTRACT.sql.state) return this.stateRows as T[];
    if (sql === CONTRACT.sql.openStatePayload) return this.openStatePayloadRows as T[];
    if (sql === CONTRACT.sql.readingPayload) return this.readingPayloadRows as T[];
    if (sql === CONTRACT.sql.reviewPayload) return this.reviewPayloadRows as T[];
    if (sql === CONTRACT.sql.settingPayload) return this.settingPayloadRows as T[];
    if (sql === CONTRACT.sql.reviewLog) {
      return this.reviewRows.filter((row) => row.device_id === params[0]) as T[];
    }
    return [];
  }

  async run(sql: string, params: DbParams = []) {
    if (sql === CONTRACT.sql.metaDelete) this.meta.delete(String(params[0]));
    if (sql === CONTRACT.sql.metaUpsert) this.meta.set(String(params[0]), String(params[1]));
    if (sql.startsWith('UPDATE sync_delivery_receipts SET status')) {
      if (params[6] === this.failClientOpId) throw new Error('forced_ack_failure');
      this.acks.push({
        clientOpId: String(params[6]),
        objectId: 'stored-object',
        objectType: 'stored-type'
      });
    }
    return { changes: 1, lastInsertRowId: null };
  }

  async transaction<T>(execute: (tx: DbPort) => Promise<T>): Promise<T> {
    const snapshot = [...this.acks];
    try {
      return await execute(this);
    } catch (error) {
      this.acks = snapshot;
      throw error;
    }
  }
}
