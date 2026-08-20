import { REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL } from './androidCompanionSyncPolicySql.js';

export const ANDROID_COMPANION_SYNC_STATE_CHANGES_SQL =
  'SELECT object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at, base_content_hash ' +
  "FROM sync_object_state WHERE object_type NOT IN ('node', 'view_state') AND sync_dirty = 1 AND state_seq > ? " +
  'AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt ' +
  "WHERE receipt.authorization_id = ? AND receipt.stream_name = 'state' " +
  "AND receipt.operation_id = sync_object_state.object_type || ':' || sync_object_state.object_id || ':' || sync_object_state.state_seq " +
  `AND (receipt.status IN ('accepted', 'confirmed') OR ` +
  `(receipt.status IN ('conflict', 'rejected') AND receipt.object_type IN (${REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL})))) ` +
  'ORDER BY state_seq ASC LIMIT ?';

export const ANDROID_COMPANION_SYNC_REVIEW_LOG_SQL =
  'SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, ' +
  'due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after ' +
  'FROM review_log WHERE host_name = ? ' +
  "AND (? = '' OR ? = '' OR reviewed_at > ? OR (reviewed_at = ? AND op_id > ?)) " +
  "AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt WHERE receipt.authorization_id = ? " +
  "AND receipt.stream_name = 'review_log' AND receipt.operation_id = 'review_log:' || review_log.op_id " +
  "AND receipt.status <> 'pending') " +
  'ORDER BY reviewed_at ASC, op_id ASC LIMIT ?';
