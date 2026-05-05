import { describe, expect, it } from 'vitest';

import {
  nodeReadingSyncAdapter,
  nodeReviewSyncAdapter,
  reviewLogSyncAdapter,
  type SyncPushAck,
  type SyncableReviewLogRow,
  type SyncableStateObjectRow
} from './companionSyncPushProtocol';

function createNodeReviewRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-base',
    content_hash: 'android-next',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: '{"reps":2}',
    state_seq: 12,
    updated_at: '2026-04-30T01:00:00.000Z',
    ...overrides
  };
}

function createNodeReadingRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-reading-base',
    content_hash: 'android-reading-next',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: '{"state":"active","reading_position":42}',
    state_seq: 13,
    updated_at: '2026-04-30T01:05:00.000Z',
    ...overrides
  };
}

function createReviewLogRow(overrides: Partial<SyncableReviewLogRow> = {}): SyncableReviewLogRow {
  return {
    device_id: 'android-device',
    difficulty_after: 2,
    difficulty_before: 1,
    due_after: '2026-05-01T00:00:00.000Z',
    due_before: '2026-04-30T00:00:00.000Z',
    grade: 3,
    id: 'review-1',
    node_id: 'node-1',
    op_id: 'op-1',
    reviewed_at: '2026-04-30T01:00:00.000Z',
    scheduler_version: 'ts-fsrs@4',
    stability_after: 3,
    stability_before: 2,
    ...overrides
  };
}

function createAck(row: SyncableStateObjectRow, overrides: Partial<SyncPushAck> = {}): SyncPushAck {
  return {
    clientOpId: `node_review:${row.object_id}:${row.state_seq}`,
    identity: nodeReviewSyncAdapter.identity(row),
    stateSeq: row.state_seq,
    status: 'accepted',
    ...overrides
  };
}

describe('companion sync push protocol adapters', () => {
  it('builds a node_review push payload with content-hash base reference', () => {
    const row = createNodeReviewRow();

    expect(nodeReviewSyncAdapter.buildPushPayload(row)).toEqual({
      base: { baseContentHash: 'desktop-base', kind: 'content_hash' },
      clientOpId: 'node_review:node-1:12',
      contentHash: 'android-next',
      deletedAt: null,
      identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
      payloadJson: '{"reps":2}',
      updatedAt: '2026-04-30T01:00:00.000Z'
    });
  });

  it('builds a node_reading push payload with content-hash base reference', () => {
    const row = createNodeReadingRow();

    expect(nodeReadingSyncAdapter.buildPushPayload(row)).toEqual({
      base: { baseContentHash: 'desktop-reading-base', kind: 'content_hash' },
      clientOpId: 'node_reading:node-1:13',
      contentHash: 'android-reading-next',
      deletedAt: null,
      identity: { objectId: 'node-1', objectType: 'node_reading', scope: 'workspace' },
      payloadJson: '{"state":"active","reading_position":42}',
      updatedAt: '2026-04-30T01:05:00.000Z'
    });
  });

  it('blocks legacy node_review dirty rows that have no base reference', () => {
    const row = createNodeReviewRow({ base_content_hash: null });

    expect(nodeReviewSyncAdapter.baseReference(row)).toEqual({
      kind: 'blocked',
      reason: 'missing_base_reference'
    });
  });

  it('confirms node_review dirty only after pulled state reaches the ack state_seq', () => {
    const row = createNodeReviewRow();
    const ack = createAck(row, { stateSeq: 12 });

    expect(nodeReviewSyncAdapter.isConfirmedBy(createNodeReviewRow({ state_seq: 11 }), ack)).toBe(false);
    expect(nodeReviewSyncAdapter.isConfirmedBy(createNodeReviewRow({ state_seq: 12 }), ack)).toBe(true);
    expect(nodeReviewSyncAdapter.isConfirmedBy(createNodeReviewRow({ state_seq: 13 }), ack)).toBe(true);
  });

  it('confirms node_reading dirty only after pulled state reaches the ack state_seq', () => {
    const row = createNodeReadingRow();
    const ack: SyncPushAck = {
      clientOpId: 'node_reading:node-1:13',
      identity: nodeReadingSyncAdapter.identity(row),
      stateSeq: 13,
      status: 'accepted'
    };

    expect(nodeReadingSyncAdapter.isConfirmedBy(createNodeReadingRow({ state_seq: 12 }), ack)).toBe(false);
    expect(nodeReadingSyncAdapter.isConfirmedBy(createNodeReadingRow({ state_seq: 13 }), ack)).toBe(true);
    expect(nodeReadingSyncAdapter.isConfirmedBy(createNodeReviewRow({ state_seq: 13 }), ack)).toBe(false);
  });

  it('does not confirm node_review conflicts', () => {
    const row = createNodeReviewRow();

    expect(nodeReviewSyncAdapter.isConfirmedBy(row, createAck(row, {
      stateSeq: row.state_seq,
      status: 'conflict'
    }))).toBe(false);
  });

  it('builds review_log append-only payloads keyed by op_id', () => {
    const row = createReviewLogRow();

    expect(reviewLogSyncAdapter.buildPushPayload(row)).toMatchObject({
      base: { kind: 'op_id', opId: 'op-1' },
      clientOpId: 'review_log:op-1',
      identity: { objectId: 'op-1', objectType: 'review_log', scope: 'workspace' }
    });
  });

  it('confirms review_log accepted and already-applied acks by op_id', () => {
    const row = createReviewLogRow();
    const ack: SyncPushAck = {
      clientOpId: 'review_log:op-1',
      identity: reviewLogSyncAdapter.identity(row),
      status: 'already_applied'
    };

    expect(reviewLogSyncAdapter.isConfirmedBy(row, ack)).toBe(true);
    expect(reviewLogSyncAdapter.isConfirmedBy(createReviewLogRow({ op_id: 'op-2' }), ack)).toBe(false);
  });
});
