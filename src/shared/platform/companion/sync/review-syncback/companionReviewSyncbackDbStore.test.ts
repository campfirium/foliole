import { beforeEach, expect, it } from 'vitest';

import { COMPANION_REVIEW_SYNCBACK_HOST_CONTRACT as CONTRACT } from '../../../../../../lib/core/database/companionReviewSyncbackHostContractDefinitions';
import type { DbParams, DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

import { createCompanionReviewSyncbackDbStore } from './companionReviewSyncbackDbStore';

let fake: FakeDbPort;

beforeEach(() => {
  fake = new FakeDbPort();
});

it('selects only local review state and review log through the shared contract', async () => {
  fake.meta.set('device_id', 'ios-device');
  fake.stateRows = [{
    base_content_hash: 'base-hash',
    content_hash: 'review-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    state_seq: 4,
    updated_at: '2026-07-20T00:00:00.000Z'
  }];
  fake.payloadRows = [{
    difficulty: 3.2, due: '2026-07-22T00:00:00.000Z', elapsed_days: 1, lapses: 0,
    last_review_at: '2026-07-20T00:00:00.000Z', node_id: 'node-1', reps: 2,
    scheduled_days: 2, stability: 4.1, state: 2
  }];
  fake.reviewRows = [reviewRow('ios-device', 'op-1'), reviewRow('other-device', 'op-2')];
  const store = createCompanionReviewSyncbackDbStore(fake);

  await expect(store.loadStateChanges(null, 20)).resolves.toEqual([
    expect.objectContaining({
      object_id: 'node-1',
      payload_json: JSON.stringify(fake.payloadRows[0]),
      state_seq: 4
    })
  ]);
  await expect(store.loadReviewLog(null, 20)).resolves.toEqual([reviewRow('ios-device', 'op-1')]);
  expect(fake.queries).toContainEqual([CONTRACT.sql.reviewState, [0, 20]]);
  expect(fake.queries).toContainEqual([
    CONTRACT.sql.reviewLog,
    ['ios-device', '', '', '', '', '', 20]
  ]);
});

it('persists cursors and saves valid acknowledgements atomically', async () => {
  const store = createCompanionReviewSyncbackDbStore(fake);
  const cursor = { change_id: 'op-1', created_at: '2026-07-20T00:00:00.000Z' };

  await store.saveStatePushCursor(4);
  await store.saveReviewLogPushCursor(cursor);
  await expect(store.loadStatePushCursor()).resolves.toBe(4);
  await expect(store.loadReviewLogPushCursor()).resolves.toEqual(cursor);
  await expect(store.savePushAcks([
    ack('review-state', 'node_review', 'node-1', 'accepted', 4),
    ack('review-log', 'review_log', 'op-1', 'accepted')
  ])).resolves.toEqual(['review-state']);
  expect(fake.acks.map((row) => row.clientOpId)).toEqual(['review-state']);

  fake.failClientOpId = 'second';
  await expect(store.savePushAcks([
    ack('first', 'node_review', 'node-2', 'conflict'),
    ack('second', 'node_review', 'node-3', 'rejected')
  ])).rejects.toThrow('forced_ack_failure');
  expect(fake.acks.map((row) => row.clientOpId)).toEqual(['review-state']);
});

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
  objectType: 'node_review' | 'review_log',
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
  acks: Array<{ clientOpId: string; objectId: string }> = [];
  failClientOpId: string | null = null;
  payloadRows: DbRow[] = [];
  reviewRows: DbRow[] = [];
  stateRows: DbRow[] = [];

  async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    this.queries.push([sql, params]);
    if (sql === CONTRACT.sql.metaQuery) {
      const value = this.meta.get(String(params[0]));
      return (value === undefined ? [] : [{ value }]) as unknown as T[];
    }
    if (sql === CONTRACT.sql.reviewState) return this.stateRows as T[];
    if (sql === CONTRACT.sql.reviewPayload) return this.payloadRows as T[];
    if (sql === CONTRACT.sql.reviewLog) {
      return this.reviewRows.filter((row) => row.device_id === params[0]) as T[];
    }
    return [];
  }

  async run(sql: string, params: DbParams = []) {
    if (sql === CONTRACT.sql.metaDelete) this.meta.delete(String(params[0]));
    if (sql === CONTRACT.sql.metaUpsert) this.meta.set(String(params[0]), String(params[1]));
    if (sql === CONTRACT.sql.ackDeleteIssues) {
      this.acks = this.acks.filter((row) => row.objectId !== params[1]);
    }
    if (sql === CONTRACT.sql.ackUpsert) {
      if (params[0] === this.failClientOpId) throw new Error('forced_ack_failure');
      this.acks.push({ clientOpId: String(params[0]), objectId: String(params[2]) });
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
