import { expect, it } from 'vitest';

import {
  resolveCompanionMembershipApproval, resolveCompanionMembershipDeviceId
} from './companionMembershipApproval.js';

const request = {
  client_address: null, compatibility: {} as never, device_id: 'A5 2',
  device_kind: 'android-capacitor', device_name: 'A5', expires_at: 'later',
  pairing_public_key: 'public', pair_request_id: 'request-1', protocol: {} as never,
  requested_at: 'now', status: 'pending' as const
};
const group = {
  created_at: 'now', created_by_device_id: 'Mac', display_name: 'Mac', group_id: 'group-1',
  local_device_id: 'Mac', local_member_state: 'active' as const, timeline_id: 'timeline-1',
  members: [{ approved_by_device_id: 'Mac', authorization_id: 'authorization-1',
    device_id: 'A5 2', device_kind: 'android-capacitor', device_name: 'A5 2',
    joined_at: 'now', state: 'active' as const }]
};

it('uses ordinary approval to re-deliver the key to an exact active member', () => {
  expect(resolveCompanionMembershipApproval(request, group)).toBe('recover_existing_member');
});

it('uses ordinary approval to register a request without an exact active member', () => {
  expect(resolveCompanionMembershipApproval(request, { ...group, members: [] }))
    .toBe('join_as_new_member');
});

it('recovers one active assigned-name member from the public device name', () => {
  const publicRequest = { ...request, device_id: 'A5', device_name: 'A5' };
  expect(resolveCompanionMembershipApproval(publicRequest, group)).toBe('recover_existing_member');
  expect(resolveCompanionMembershipDeviceId(publicRequest, group)).toBe('A5 2');
});

it('does not guess between multiple active assigned-name members', () => {
  const ambiguous = { ...group, members: [...group.members, {
    ...group.members[0]!, authorization_id: 'authorization-2', device_id: 'A5 3', device_name: 'A5 3'
  }] };
  const publicRequest = { ...request, device_id: 'A5', device_name: 'A5' };
  expect(resolveCompanionMembershipApproval(publicRequest, ambiguous)).toBe('join_as_new_member');
  expect(resolveCompanionMembershipDeviceId(publicRequest, ambiguous)).toBe('A5');
});
