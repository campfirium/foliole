// @vitest-environment node
import { expect, it } from 'vitest';

import {
  parseStateWritebackSnapshot,
  verifyStateWritebackAcceptance
} from './ios-state-writeback-acceptance-runner.mjs';

function snapshot() {
  return parseStateWritebackSnapshot(JSON.stringify([{
    active_node_id: 'ios-state-node',
    local_reading_position: 42,
    local_scroll_top: 42,
    pending_ack_count: 0,
    review_cursor: '{"change_id":"review-op","created_at":"2026-07-21T00:01:00.000Z"}',
    review_log_count: 1,
    review_op_id: 'review-op',
    shared_dirty_count: 0,
    shared_state_count: 3,
    view_state_sync_count: 0
  }]));
}

function observations() {
  return {
    state_writeback: {
      ack_statuses: ['accepted', 'accepted', 'accepted', 'accepted'],
      pack_requests: 3,
      push_requests: 1,
      pushed_object_types: ['node_reading', 'node_review', 'setting', 'review_log']
    }
  };
}

it('accepts confirmed shared state while preserving device-private state after restart', () => {
  const first = {
    phase: 'applied',
    sync: { pushRejectedCount: 0, pushedObjectIds: ['reading', 'review', 'setting'], pushedReviewOpIds: ['review-op'] }
  };
  const second = { phase: 'reapplied', sync: { pushedObjectIds: [], pushedReviewOpIds: [] } };

  expect(verifyStateWritebackAcceptance(first, second, snapshot(), snapshot(), observations()))
    .toMatchObject({ first_snapshot: { local_reading_position: 42, local_scroll_top: 42 } });
});

it('rejects a transient HTTP ack that was not cleared by confirmation apply', () => {
  const first = {
    phase: 'applied',
    sync: { pushRejectedCount: 0, pushedObjectIds: ['reading', 'review', 'setting'], pushedReviewOpIds: ['review-op'] }
  };
  const second = { phase: 'reapplied', sync: { pushedObjectIds: [], pushedReviewOpIds: [] } };

  expect(() => verifyStateWritebackAcceptance(
    first, second, { ...snapshot(), pending_ack_count: 1 }, snapshot(), observations()
  )).toThrow('evidence is incomplete');
});
