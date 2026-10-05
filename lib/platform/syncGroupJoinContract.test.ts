import { describe, expect, it } from 'vitest';

import {
  parseSyncGroupJoinGroupInfo,
  parseSyncGroupJoinRequestInput,
  syncGroupJoinAttemptFingerprint,
  SYNC_GROUP_JOIN_CONTRACT_VERSION
} from './syncGroupJoinContract.js';

const PUBLIC_KEY = `BA${'A'.repeat(85)}`;

it.each([null, {}, { library_epoch: 'epoch', proof_revision: -1, source_proof_revisions: {} },
  { library_epoch: 'epoch', proof_revision: 1, source_proof_revisions: { peer: -1 } },
  { library_epoch: ' epoch', proof_revision: 1, source_proof_revisions: {} },
  { library_epoch: 'epoch', proof_revision: 1, source_proof_revisions: { ' peer': 1 } }])(
  'rejects an invalid merge proof instead of treating it as overwrite', (merge_proof) => {
    expect(() => parseSyncGroupJoinRequestInput({
      contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
      device: { canonical_library_path: '/library', device_anchor: 'a1111111-1111-4111-8111-111111111111',
        device_name: 'Phone', path_flavor: 'posix', platform: 'ios-capacitor' },
      ephemeral_public_key: PUBLIC_KEY, group_id: 'group-a', merge_proof
    })).toThrow('sync_group_join_merge_proof_invalid');
  }
);

it('fingerprints the complete attempt with canonical proof ordering', () => {
  const base = {
    contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION as 1,
    device: { canonical_library_path: '/library',
      device_anchor: 'a1111111-1111-4111-8111-111111111111',
      device_name: 'Phone', path_flavor: 'posix' as const, platform: 'ios-capacitor' },
    ephemeral_public_key: PUBLIC_KEY, group_id: 'group-a'
  };
  const first = syncGroupJoinAttemptFingerprint({ ...base, merge_proof: {
    library_epoch: 'epoch', proof_revision: 2, source_proof_revisions: { peer_b: 2, peer_a: 1 }
  } });
  const reordered = syncGroupJoinAttemptFingerprint({ ...base, merge_proof: {
    library_epoch: 'epoch', proof_revision: 2, source_proof_revisions: { peer_a: 1, peer_b: 2 }
  } });
  expect(reordered).toBe(first);
  expect(syncGroupJoinAttemptFingerprint({ ...base, group_id: 'group-b' })).not.toBe(first);
});

describe('Sync Group join contract', () => {
  it('binds one canonical Device request to one ephemeral public key', () => {
    const request = parseSyncGroupJoinRequestInput({
      contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
      device: {
        canonical_library_path: '/Users/foliole/Library/Data/foliole.db',
        device_anchor: 'a1111111-1111-4111-8111-111111111111',
        device_name: 'Reading phone',
        path_flavor: 'posix',
        platform: 'android'
      },
      ephemeral_public_key: PUBLIC_KEY,
      group_id: 'group-a'
    });

    expect(request.device.device_name).toBe('Reading phone');
    expect(request.ephemeral_public_key).toBe(PUBLIC_KEY);
    expect(request).not.toHaveProperty('member');
    expect(request).not.toHaveProperty('authorization_id');
  });

  it('rejects noncanonical paths, extra identity layers, and malformed keys', () => {
    const base = {
      contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
      device: {
        canonical_library_path: '/Users/foliole/Library/../Library/Data/foliole.db',
        device_anchor: 'a1111111-1111-4111-8111-111111111111',
        device_name: 'Phone', path_flavor: 'posix', platform: 'android'
      },
      ephemeral_public_key: PUBLIC_KEY, group_id: 'group-a'
    };
    expect(() => parseSyncGroupJoinRequestInput(base)).toThrow('library_path_not_canonical');
    expect(() => parseSyncGroupJoinRequestInput({ ...base, device: {
      ...base.device, canonical_library_path: '/Library/Data/foliole.db'
    }, member_id: 'member-a' })).toThrow('sync_group_join_payload_shape_invalid');
    expect(() => parseSyncGroupJoinRequestInput({ ...base, device: {
      ...base.device, canonical_library_path: '/Library/Data/foliole.db'
    }, ephemeral_public_key: 'invalid' })).toThrow('sync_group_join_public_key_invalid');
  });

  it('allows only group information in the accepted plaintext', () => {
    expect(parseSyncGroupJoinGroupInfo({
      display_name: 'My Sync Group', group_id: 'group-a',
      workgroup_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    })).toEqual({
      display_name: 'My Sync Group', group_id: 'group-a',
      workgroup_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    });
    expect(() => parseSyncGroupJoinGroupInfo({
      authorization_id: 'legacy', display_name: 'My Sync Group', group_id: 'group-a',
      workgroup_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    })).toThrow('sync_group_join_payload_shape_invalid');
  });
});
