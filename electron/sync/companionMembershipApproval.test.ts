import { expect, it, vi } from 'vitest';

import {
  resolveCompanionMembershipApproval,
  resolveCompanionMembershipAuthorizationId,
  resolveCompanionMembershipHostName
} from './companionMembershipApproval.js';

vi.mock('./companionPairingStore.js', () => ({ loadPairedCompanionDevice: () => null }));

const request = {
  client_address: null, compatibility: {} as never, device_id: 'device-a5',
  device_kind: 'android-capacitor', device_name: 'A5', host_name: 'A5',
  host_platform: 'android-capacitor', expires_at: 'later', pairing_public_key: 'public',
  pair_request_id: 'request-1', protocol: {} as never, requested_at: 'now', status: 'pending' as const
};
const group = {
  created_at: 'now', created_by_host_name: 'Mac', display_name: 'Mac', group_id: 'group-1',
  local_host_name: 'Mac', local_member_state: 'active' as const, timeline_id: 'timeline-1',
  members: [{ approved_by_host_name: 'Mac', authorization_id: 'authorization-1',
    host_name: 'A5', host_platform: 'android-capacitor', joined_at: 'now', state: 'active' as const }]
};

it('recovers the existing authorization for an exact active Host', () => {
  expect(resolveCompanionMembershipApproval(request, group)).toBe('recover_existing_member');
  expect(resolveCompanionMembershipAuthorizationId(request, group)).toBe('authorization-1');
});

it('registers a request without an active Host as a new member', () => {
  expect(resolveCompanionMembershipApproval(request, { ...group, members: [] }))
    .toBe('join_as_new_member');
  expect(resolveCompanionMembershipAuthorizationId(request, { ...group, members: [] })).toBeNull();
});

it('keeps the presented Host name separate from the credential Device identity', () => {
  expect(resolveCompanionMembershipHostName({ ...request, device_name: 'credential-device' }))
    .toBe('A5');
});
