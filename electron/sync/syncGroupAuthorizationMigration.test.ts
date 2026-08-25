import { expect, it, vi } from 'vitest';

import type { SyncGroupSecureRouteMetadata } from '../../lib/platform/syncGroupAuthorizationContract.js';

import { migrateLegacyPairingToSyncGroupRoute } from './syncGroupAuthorizationMigration.js';

const route: SyncGroupSecureRouteMetadata = {
  authorization_epoch: 1, authorization_id: 'authorization-local', endpoint_hint: null,
  group_id: 'group-a', kind: 'member', local_member_id: 'member-local',
  peer_member_id: 'member-peer', protocol_version: 4, route_id: 'route-a', state: 'active'
};
const candidate = {
  authorization_id: 'authorization-local', candidate_id: 'candidate-a',
  credential_fingerprint: 'fingerprint-a', credential_secret: 'secret-a', group_id: 'group-a',
  legacy_local_member_key: 'Maci', legacy_peer_member_key: 'Reader'
};

it('does not write when legacy pairing records conflict', () => {
  const store = fakeStore();
  const result = migrateLegacyPairingToSyncGroupRoute({
    candidates: [candidate, { ...candidate, candidate_id: 'candidate-b', credential_fingerprint: 'other' }],
    legacy_authorization_id: 'authorization-local', legacy_local_member_key: 'Maci',
    legacy_peer_member_key: 'Reader', route, store: store.value
  });
  expect(result).toEqual({ reason: 'credential_conflict', status: 'repair' });
  expect(store.save).not.toHaveBeenCalled();
});

it('rolls back the inactive route store when migration verification fails', () => {
  const store = fakeStore();
  store.load.mockReturnValue(null);
  expect(() => migrateLegacyPairingToSyncGroupRoute({
    candidates: [candidate], legacy_authorization_id: 'authorization-local',
    legacy_local_member_key: 'Maci', legacy_peer_member_key: 'Reader', route, store: store.value
  })).toThrow('sync_group_route_migration_verify_failed');
  expect(store.restore).toHaveBeenCalledWith(Buffer.from('snapshot'));
});

function fakeStore() {
  const save = vi.fn(() => route);
  const load = vi.fn((): SyncGroupSecureRouteMetadata | null => route);
  const restore = vi.fn();
  return {
    load, restore, save,
    value: { load, restore, save, snapshot: () => Buffer.from('snapshot') } as never
  };
}
