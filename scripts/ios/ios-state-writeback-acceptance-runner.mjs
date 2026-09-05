import path from 'node:path';

import { hostedProviderLifecyclePassed } from './ios-hosted-provider-evidence.mjs';

const SHARED_TYPES = "'node_reading', 'node_review', 'setting'";

export function parseStateWritebackSnapshot(output) {
  const [row] = JSON.parse(output || '[]');
  return {
    active_node_id: row?.active_node_id ?? null,
    confirmed_review_delivery_count: Number(row?.confirmed_review_delivery_count ?? 0),
    local_reading_position: Number(row?.local_reading_position ?? -1),
    local_scroll_top: Number(row?.local_scroll_top ?? -1),
    local_view_state_count: Number(row?.local_view_state_count ?? -1),
    pending_ack_count: Number(row?.pending_ack_count ?? -1),
    review_log_count: Number(row?.review_log_count ?? 0),
    review_op_id: row?.review_op_id ?? null,
    shared_dirty_count: Number(row?.shared_dirty_count ?? -1),
    shared_state_count: Number(row?.shared_state_count ?? 0)
  };
}

export function readStateWritebackSnapshot(options) {
  const databasePath = path.join(options.containerPath, options.databaseRelativePath);
  const sql = `SELECT
    (SELECT value FROM workspace_meta WHERE key = 'active_node_id') AS active_node_id,
    (SELECT reading_position FROM node_reading_host_state WHERE node_id = 'ios-state-node') AS local_reading_position,
    (SELECT scroll_top FROM node_view_state WHERE node_id = 'ios-state-node') AS local_scroll_top,
    (SELECT count(*) FROM sync_delivery_receipts
      WHERE object_type <> 'view_state' AND status <> 'confirmed') AS pending_ack_count,
    (SELECT count(*) FROM review_log WHERE node_id = 'ios-state-node') AS review_log_count,
    (SELECT op_id FROM review_log WHERE node_id = 'ios-state-node' LIMIT 1) AS review_op_id,
    (SELECT count(*) FROM sync_delivery_receipts
      WHERE stream_name = 'review_log' AND status = 'confirmed'
      AND object_id = (SELECT op_id FROM review_log WHERE node_id = 'ios-state-node' LIMIT 1)
    ) AS confirmed_review_delivery_count,
    (SELECT count(*) FROM sync_object_state WHERE object_type IN (${SHARED_TYPES}) AND sync_dirty = 1) AS shared_dirty_count,
    (SELECT count(*) FROM sync_object_state WHERE object_type IN (${SHARED_TYPES})) AS shared_state_count,
    (SELECT count(*) FROM sync_object_state WHERE object_type = 'view_state') AS local_view_state_count;`;
  return parseStateWritebackSnapshot(options.capture('sqlite3', ['-json', databasePath, sql]));
}

function bridgeEvidencePassed(first, second) {
  return first.phase === 'applied' && first.sync?.pushRejectedCount === 0 &&
    first.sync?.pushedObjectIds?.length === 3 && first.sync?.pushedReviewOpIds?.length === 1 &&
    second.phase === 'reapplied' && second.sync?.pushedObjectIds?.length === 0 &&
    second.sync?.pushedReviewOpIds?.length === 0;
}

function snapshotPassed(snapshot) {
  return snapshot.active_node_id === 'ios-state-node' && snapshot.local_reading_position === 42 &&
    snapshot.local_scroll_top === 42 && snapshot.pending_ack_count === 0 &&
    snapshot.review_log_count === 1 && snapshot.confirmed_review_delivery_count === 1 &&
    snapshot.shared_dirty_count === 0 && snapshot.shared_state_count === 3 &&
    snapshot.local_view_state_count === 2;
}

export function verifyStateWritebackAcceptance(first, second, firstSnapshot, secondSnapshot, observations) {
  const state = observations.state_writeback ?? {};
  const pushedTypes = [...(state.pushed_object_types ?? [])].sort();
  const servicePassed = hostedProviderLifecyclePassed(observations) &&
    state.push_requests === 1 && state.pack_requests === 3 &&
    JSON.stringify(pushedTypes) === JSON.stringify(['node_reading', 'node_review', 'review_log', 'setting']) &&
    state.ack_statuses?.length === 4 && state.ack_statuses.every((status) => status === 'accepted');
  const verdicts = {
    bridge: bridgeEvidencePassed(first, second),
    restartStable: JSON.stringify(secondSnapshot) === JSON.stringify(firstSnapshot),
    service: servicePassed,
    snapshot: snapshotPassed(firstSnapshot)
  };
  if (Object.values(verdicts).some((passed) => !passed)) {
    throw new Error(`iOS state writeback acceptance evidence is incomplete: ${JSON.stringify({
      first, firstSnapshot, second, secondSnapshot, verdicts
    })}`);
  }
  return { first, first_snapshot: firstSnapshot, observations: state, second, second_snapshot: secondSnapshot };
}
