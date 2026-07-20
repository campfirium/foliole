import {
  SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES,
  syncPolicySqlInList
} from '../sync/syncObjectPolicy.js';

export const REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL = syncPolicySqlInList(SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES);
