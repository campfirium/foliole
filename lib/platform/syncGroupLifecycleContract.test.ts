import { expect, it } from 'vitest';

import {
  parseSyncGroupJoinApplication,
  parseSyncGroupDepartureFact,
  parseSyncGroupRosterSnapshot,
  parseSyncGroupRouteGrant,
  SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN
} from './syncGroupLifecycleContract.js';

it('parses protocol v4 lifecycle wire values and rejects untrusted versions', () => {
  const application = {
    application_public_key: 'public-key', created_at: '2026-08-26T00:00:00.000Z',
    group_id: 'group-a', installation_id: 'installation-ios', library_facts: { count: 1 },
    previous_member_id: null, protocol_version: 4, request_id: 'request-a',
    requested_display_name: 'iPhone', requested_platform: 'ios', state: 'waiting',
    timeline_id: 'timeline-a', updated_at: '2026-08-26T00:00:00.000Z'
  };
  const grant = {
    authorization_epoch: 1, authorization_id: 'authorization-a', created_at: application.created_at,
    encrypted_route_secret: { algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM', ciphertext: 'cipher' },
    grant_id: 'grant-a', group_id: 'group-a', local_member_id: 'member-ios',
    peer_member_id: 'member-manager', request_id: 'request-a', roster_revision: 2,
    route_id: 'route-a', state: 'pending', timeline_id: 'timeline-a', updated_at: application.updated_at
  };

  expect(parseSyncGroupJoinApplication(application)).toEqual(application);
  expect(parseSyncGroupRouteGrant(grant)).toEqual(grant);
  expect(parseSyncGroupRosterSnapshot({ group_id: 'group-a', manager_member_id: 'member-manager',
    members: [{ authorization_epoch: 1, authorization_id: 'authorization-manager', display_name: 'Manager',
      installation_id: 'installation-manager', member_id: 'member-manager', platform: 'darwin',
      role: 'manager', state: 'active' }], roster_revision: 0, state: 'active', timeline_id: 'timeline-a' }))
    .toMatchObject({ roster_revision: 0 });
  expect(parseSyncGroupDepartureFact({ created_at: application.created_at, departure_id: 'departure-a',
    group_id: 'group-a', kind: 'leave', last_error: null, member_id: 'member-ios', roster_revision: 1,
    state: 'pending', timeline_id: 'timeline-a', updated_at: application.updated_at }))
    .toMatchObject({ kind: 'leave', state: 'pending' });
  expect(() => parseSyncGroupJoinApplication({ ...application, protocol_version: 3 }))
    .toThrow('sync_group_lifecycle_invalid_protocol_version');
  expect(SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN).toMatch(/^t151-prepare/u);
});
