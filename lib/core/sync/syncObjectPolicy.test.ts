import { describe, expect, it } from 'vitest';

import {
  isBlockingAckForDirtyRetry,
  SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES
} from './syncObjectPolicy.js';

describe('sync object push issue policy', () => {
  it('retries stale node open-state conflicts because the desktop merges them by LWW', () => {
    expect(isBlockingAckForDirtyRetry({
      object_type: 'node_open_state', status: 'conflict'
    })).toBe(false);
    expect(SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES).not.toContain('node_open_state');
  });

  it('keeps review-state conflicts behind explicit review', () => {
    expect(isBlockingAckForDirtyRetry({
      object_type: 'node_review', status: 'conflict'
    })).toBe(true);
  });
});
