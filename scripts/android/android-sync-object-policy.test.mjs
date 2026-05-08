// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  SYNC_OBJECT_POLICIES,
  SYNC_POLICY_DEVICE_PRIVATE_OBJECT_TYPES,
  SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES,
  isBlockingAckForDirtyRetry,
  isReviewRequiredPushIssueObjectType
} from '../../lib/core/sync/syncObjectPolicy.ts';

describe('sync object policy', () => {
  it('covers mixed object and field level sync state classes', () => {
    expect(SYNC_OBJECT_POLICIES.map((item) => item.key)).toEqual(expect.arrayContaining([
      'node',
      'node_reading',
      'node_reading.reading_position',
      'node_reading_device_state',
      'node_review',
      'review_log',
      'setting.workspace',
      'setting.device',
      'view_state.active_node',
      'view_state.node',
      'sync_push_ack'
    ]));
  });

  it('keeps device private state out of review-required push issues', () => {
    expect(SYNC_POLICY_DEVICE_PRIVATE_OBJECT_TYPES).toContain('view_state');
    expect(SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES).toContain('node_review');
    expect(isReviewRequiredPushIssueObjectType('view_state')).toBe(false);
    expect(isBlockingAckForDirtyRetry({ object_type: 'view_state', status: 'conflict' })).toBe(false);
    expect(isBlockingAckForDirtyRetry({ object_type: 'view_state', status: 'accepted' })).toBe(true);
    expect(isBlockingAckForDirtyRetry({ object_type: 'node_review', status: 'conflict' })).toBe(true);
  });
});
