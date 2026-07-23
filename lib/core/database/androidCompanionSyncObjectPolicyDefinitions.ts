import {
  SYNC_OBJECT_POLICIES,
  SYNC_POLICY_DEVICE_PRIVATE_OBJECT_TYPES,
  SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES
} from '../sync/syncObjectPolicy.js';

export const ANDROID_COMPANION_SYNC_OBJECT_TYPES = {
  nodeOpenState: 'node_open_state',
  nodeReading: 'node_reading',
  nodeReview: 'node_review',
  settingRecord: 'setting',
  viewState: 'view_state'
} as const;

export const ANDROID_COMPANION_SYNC_OBJECT_POLICY_DEFINITIONS = {
  devicePrivateObjectTypes: SYNC_POLICY_DEVICE_PRIVATE_OBJECT_TYPES,
  policies: SYNC_OBJECT_POLICIES,
  reviewRequiredPushIssueObjectTypes: SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES
} as const;
