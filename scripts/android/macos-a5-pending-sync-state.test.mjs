import { expect, it } from 'vitest';

import {
  hasCompleteDirtyStateEvidence, hasProtectedPendingSyncState
} from './macos-a5-pending-sync-state.mjs';

const pending = {
  activeSyncGroupMemberCount: 3,
  localMemberAuthorizationFingerprint: '2fdd44bb500a5934',
  dirtyObjectCounts: { setting: 3 },
  dirtyRecordCount: 3,
  missingPrerequisites: ['unsynced_device_data_requires_review'],
  resultStatus: 'approval_required',
  schemaVersion: 1,
  storedSyncGroupId: 'group-1',
  storedSyncGroupTimelineId: 'timeline-1',
  syncGroupCredentialsPresent: true,
  syncGroupId: 'group-1',
  syncGroupRoutePresent: true,
  syncGroupTimelineId: 'timeline-1',
  workgroupKeyPresent: true
};

it('protects any completely classified pending migration state', () => {
  expect(hasProtectedPendingSyncState(pending)).toBe(true);
  expect(hasCompleteDirtyStateEvidence({
    dirtyObjectCounts: { node: 2, setting: 4 }, dirtyRecordCount: 6
  })).toBe(true);
});

it.each([
  ['unclassified dirty records', { ...pending, dirtyObjectCounts: { setting: 2 } }],
  ['another blocker', { ...pending, missingPrerequisites: ['existing_pairing_peer_conflict'] }],
  ['missing protected route', { ...pending, syncGroupRoutePresent: false }],
  ['group mismatch', { ...pending, storedSyncGroupId: 'group-2' }]
])('rejects pending state with %s', (_reason, value) => {
  expect(hasProtectedPendingSyncState(value)).toBe(false);
});
