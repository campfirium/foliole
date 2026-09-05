// @vitest-environment node
import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  parseStateWritebackSnapshot,
  readStateWritebackSnapshot,
  verifyStateWritebackAcceptance
} from './ios-state-writeback-acceptance-runner.mjs';
import { hostedProviderRegistrationEvidence } from './ios-hosted-provider-test-evidence.mjs';

function snapshot() {
  return parseStateWritebackSnapshot(JSON.stringify([{
    active_node_id: 'ios-state-node',
    confirmed_review_delivery_count: 1,
    local_reading_position: 42,
    local_scroll_top: 42,
    local_view_state_count: 2,
    pending_ack_count: 0,
    review_log_count: 1,
    review_op_id: 'review-op',
    shared_dirty_count: 0,
    shared_state_count: 3
  }]));
}

function observations() {
  return {
    registration: hostedProviderRegistrationEvidence(),
    state_writeback: {
      ack_statuses: ['accepted', 'accepted', 'accepted', 'accepted'],
      last_push_items: [],
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

it('rejects a review operation without a confirmed peer delivery receipt', () => {
  const first = {
    phase: 'applied',
    sync: { pushRejectedCount: 0, pushedObjectIds: ['reading', 'review', 'setting'], pushedReviewOpIds: ['review-op'] }
  };
  const second = { phase: 'reapplied', sync: { pushedObjectIds: [], pushedReviewOpIds: [] } };

  expect(() => verifyStateWritebackAcceptance(
    first, second, { ...snapshot(), confirmed_review_delivery_count: 0 }, snapshot(), observations()
  )).toThrow('evidence is incomplete');
});

it('matches the peer delivery receipt by the review operation object identity', () => {
  const source = fs.readFileSync('scripts/ios/ios-state-writeback-acceptance-runner.mjs', 'utf8');
  expect(source).toContain("AND object_id = (SELECT op_id FROM review_log");
  expect(source).not.toContain("AND operation_id = (SELECT op_id FROM review_log");
});

it('excludes device-private view state receipts from the pending shared acknowledgement count', () => {
  expect(readStateWritebackSnapshot.toString()).toContain("object_type <> 'view_state'");
});
