import { expect, it } from 'vitest';

import {
  parseSyncGroupMemberState,
  SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION
} from './syncGroupMemberStateContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from './syncProtocolContract.js';

it('requires the version frontier proof and restore state in member state v3', () => {
  const current = {
    contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION,
    devices: [], group_id: 'group', library_epoch: 'library-epoch',
    proof_revision: 0, removals: [], restore: null, sender_device_identity_key: 'device',
    source_proof_revisions: {}
  };
  expect(parseSyncGroupMemberState(current)).toEqual(current);
  expect(parseSyncGroupMemberState({ ...current, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR }).protocol)
    .toEqual(CURRENT_SYNC_PROTOCOL_DESCRIPTOR);
  expect(() => parseSyncGroupMemberState({ ...current, protocol: {} }))
    .toThrow('sync_group_member_state_invalid');
  expect(() => parseSyncGroupMemberState({ ...current, contract_version: 1 }))
    .toThrow('sync_group_member_state_invalid');
  expect(() => parseSyncGroupMemberState({ ...current, library_epoch: undefined }))
    .toThrow('sync_group_member_state_invalid');
  expect(() => parseSyncGroupMemberState({ ...current, source_proof_revisions: { device: -1 } }))
    .toThrow('sync_group_member_state_invalid');
  expect(() => parseSyncGroupMemberState({ ...current, restore: undefined }))
    .toThrow('sync_group_member_state_invalid');
});
