import { describe, expect, it } from 'vitest';

import type { SyncGroupMemberPayload } from '../../platform/syncGroupContract.js';

import { mergeSyncGroupMemberFacts } from './syncGroupMemberMerge.js';

function member(deviceId: string, approvedBy: string, state: SyncGroupMemberPayload['state'] = 'active') {
  return {
    activated_at: state === 'provisioning' ? null : `2026-08-08T00:0${deviceId.length}:00.000Z`,
    approved_by_device_id: approvedBy,
    authorization_id: `authorization-${deviceId}`,
    device_id: deviceId,
    device_kind: deviceId === 'b' ? 'android-capacitor' : 'desktop',
    device_name: deviceId.toUpperCase(),
    joined_at: `2026-08-08T00:0${deviceId.length}:00.000Z`,
    state
  } satisfies SyncGroupMemberPayload;
}

describe('Sync Group member fact convergence', () => {
  it('lets active B introduce the C fact that B directly approved', () => {
    const a = member('a', 'a');
    const b = member('b', 'a');
    const c = member('c', 'b');
    expect(mergeSyncGroupMemberFacts({
      currentMembers: [a, b], incomingMembers: [a, b, c], submittedByDeviceId: 'b'
    })).toEqual([a, b, c]);
  });

  it('rejects a forwarded new member without the approving member submission', () => {
    expect(() => mergeSyncGroupMemberFacts({
      currentMembers: [member('a', 'a'), member('b', 'a')],
      incomingMembers: [member('c', 'b')], submittedByDeviceId: 'a'
    })).toThrow('sync_group_member_introduction_not_authorized');
  });

  it('allows only the member itself to leave and never revives a left fact', () => {
    const a = member('a', 'a');
    const leftA = { ...a, state: 'left' as const };
    expect(mergeSyncGroupMemberFacts({
      currentMembers: [a], incomingMembers: [leftA], submittedByDeviceId: 'a'
    })[0]!.state).toBe('left');
    expect(() => mergeSyncGroupMemberFacts({
      currentMembers: [leftA, member('b', 'a')], incomingMembers: [a], submittedByDeviceId: 'b'
    })).toThrow('sync_group_member_left_terminal');
  });

  it('rejects authorization conflicts, duplicates, regressions, and inactive submitters', () => {
    const a = member('a', 'a');
    const b = member('b', 'a');
    expect(() => mergeSyncGroupMemberFacts({
      currentMembers: [a, b], incomingMembers: [{ ...b, authorization_id: 'forged' }], submittedByDeviceId: 'a'
    })).toThrow('sync_group_member_authorization_conflict');
    expect(() => mergeSyncGroupMemberFacts({
      currentMembers: [a, b], incomingMembers: [b, b], submittedByDeviceId: 'a'
    })).toThrow('sync_group_member_fact_invalid');
    expect(() => mergeSyncGroupMemberFacts({
      currentMembers: [a, b], incomingMembers: [{ ...b, activated_at: null, state: 'provisioning' }], submittedByDeviceId: 'a'
    })).toThrow('sync_group_member_state_regression');
    expect(() => mergeSyncGroupMemberFacts({
      currentMembers: [a, member('b', 'a', 'provisioning')], incomingMembers: [a], submittedByDeviceId: 'b'
    })).toThrow('sync_group_submitter_not_active');
  });
});
