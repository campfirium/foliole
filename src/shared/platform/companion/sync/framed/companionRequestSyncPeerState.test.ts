import { expect, it } from 'vitest';

import type { SyncGroupMemberStatePayload } from '../../../../../../lib/platform/syncGroupMemberStateContract.js';

import { rememberCompanionRequestSyncProviderState, requireCompanionRequestSyncPeerState } from './companionRequestSyncPeerState.js';

const event = { group_id: 'group', restore_id: 'restore', restored_at: '2026-10-11T00:00:00.000Z',
  source_device_identity_key: 'provider' };
function state(id: string): SyncGroupMemberStatePayload {
  return { contract_version: 3, group_id: 'group', sender_device_identity_key: id,
    library_epoch: `${id}-epoch`, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
}

it.each([null, { event, applied: false }])('allows the legitimate restore provider to respond to a pending receiver', restore => {
  const incoming = { ...state('receiver'), restore };
  rememberCompanionRequestSyncProviderState(incoming, { normal_sync_ready: false,
    state: { ...state('provider'), restore: { event, applied: true } } });
  expect(requireCompanionRequestSyncPeerState('group', 'receiver', 'receiver-epoch')).toEqual(incoming);
});

it.each(['different-provider', 'different-event', 'not-applied'])('rejects a restore response with %s', reason => {
  const incoming = { ...state('receiver'), restore: { event, applied: false } };
  const restore = { event: { ...event,
    restore_id: reason === 'different-event' ? 'other' : event.restore_id,
    source_device_identity_key: reason === 'different-provider' ? 'other' : 'provider' }, applied: reason !== 'not-applied' };
  rememberCompanionRequestSyncProviderState(incoming, { normal_sync_ready: false, state: { ...state('provider'), restore } });
  expect(() => requireCompanionRequestSyncPeerState('group', 'receiver', 'receiver-epoch')).toThrow('sync_group_member_state_required');
});
