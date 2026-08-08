import { beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ merge: vi.fn() }));
vi.mock('../database/syncGroupMembershipStore.js', () => ({ mergeDesktopSyncGroupMembership: store.merge }));

import { mergeSubmittedSyncGroupMembership } from './companionLanSyncGroupMembership.js';

beforeEach(() => store.merge.mockReset().mockReturnValue({ group_id: 'group-1' }));

it('binds the authenticated device to the submitted membership payload', () => {
  const group = { group_id: 'group-1', members: [] };
  expect(mergeSubmittedSyncGroupMembership(JSON.stringify({ sync_group: group }), 'mobile-b'))
    .toEqual({ group_id: 'group-1' });
  expect(store.merge).toHaveBeenCalledWith({ incomingGroup: group, submittedByDeviceId: 'mobile-b' });
});

it('rejects malformed membership envelopes before storage', () => {
  expect(() => mergeSubmittedSyncGroupMembership('{}', 'mobile-b')).toThrow('sync_group_membership_invalid');
  expect(store.merge).not.toHaveBeenCalled();
});
