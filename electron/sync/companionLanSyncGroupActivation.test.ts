import { beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ activateSyncGroupMember: vi.fn() }));
vi.mock('../database/syncGroupStore.js', () => store);

import { activateProvisionedSyncGroupMember } from './companionLanSyncGroupActivation.js';

beforeEach(() => store.activateSyncGroupMember.mockReset().mockReturnValue({ group_id: 'group-1' }));

it('activates the authorized member only after the fixed provisioning cursor is complete', () => {
  const body = JSON.stringify({
    completed_cursor: 42,
    completeness: {
      failed_attachment_resource_count: 0, failed_content_blob_count: 0,
      remaining_attachment_resource_count: 0, remaining_content_blob_count: 0,
      remaining_structure_change_count: 0
    },
    group_id: 'group-1', member_authorization_id: 'request-1', timeline_id: 'timeline-1'
  });
  expect(activateProvisionedSyncGroupMember(body, 'android-1')).toEqual({ group_id: 'group-1' });
  expect(store.activateSyncGroupMember).toHaveBeenCalledWith({
    authorizationId: 'request-1', completedCursor: 42, deviceId: 'android-1',
    groupId: 'group-1', timelineId: 'timeline-1'
  });
});

it('rejects activation while any body remains missing', () => {
  expect(() => activateProvisionedSyncGroupMember(JSON.stringify({
    completed_cursor: 42,
    completeness: {
      failed_attachment_resource_count: 0, failed_content_blob_count: 0,
      remaining_attachment_resource_count: 0, remaining_content_blob_count: 1,
      remaining_structure_change_count: 0
    },
    group_id: 'group-1', member_authorization_id: 'request-1', timeline_id: 'timeline-1'
  }), 'android-1')).toThrow('sync_group_provisioning_incomplete');
  expect(store.activateSyncGroupMember).not.toHaveBeenCalled();
});
