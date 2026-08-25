import { expect, it } from 'vitest';

import type { SyncGroupSecureRouteMetadata } from '../../platform/syncGroupAuthorizationContract.js';

import { createSyncGroupAuthorizationMigrationDecision } from './syncGroupAuthorizationMigrationModel.js';

const route: SyncGroupSecureRouteMetadata = {
  authorization_epoch: 1, authorization_id: 'authorization-local', endpoint_hint: null,
  group_id: 'group-a', kind: 'member', local_member_id: 'member-local',
  peer_member_id: 'member-peer', protocol_version: 4, route_id: 'route-a', state: 'active'
};
const candidate = {
  authorization_id: 'authorization-local', candidate_id: 'candidate-a',
  credential_fingerprint: 'fingerprint-a', group_id: 'group-a',
  legacy_local_member_key: 'Maci', legacy_peer_member_key: 'Reader'
};

it('selects only one exact legacy pairing route', () => {
  expect(createSyncGroupAuthorizationMigrationDecision({
    candidates: [candidate], legacy_authorization_id: 'authorization-local',
    legacy_local_member_key: 'Maci', legacy_peer_member_key: 'Reader', route
  })).toEqual({ candidate_id: 'candidate-a', route, status: 'ready' });
});

it('returns repair for conflicting legacy routes instead of selecting the last record', () => {
  expect(createSyncGroupAuthorizationMigrationDecision({
    candidates: [candidate, { ...candidate, candidate_id: 'candidate-b', credential_fingerprint: 'fingerprint-b' }],
    legacy_authorization_id: 'authorization-local', legacy_local_member_key: 'Maci',
    legacy_peer_member_key: 'Reader', route
  })).toEqual({ reason: 'credential_conflict', status: 'repair' });
});
