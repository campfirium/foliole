import type { SyncGroupMemberPayload } from '../../platform/syncGroupContract.js';

interface MergeSyncGroupMemberFactsArgs {
  currentMembers: SyncGroupMemberPayload[];
  incomingMembers: SyncGroupMemberPayload[];
  submittedByDeviceId: string;
}

const IMMUTABLE_FIELDS = [
  'approved_by_device_id',
  'authorization_id',
  'device_kind',
  'device_name',
  'joined_at'
] as const;

function memberMap(members: SyncGroupMemberPayload[]) {
  const result = new Map<string, SyncGroupMemberPayload>();
  for (const member of members) {
    if (!member.device_id.trim() || result.has(member.device_id)) {
      throw new Error('sync_group_member_fact_invalid');
    }
    result.set(member.device_id, member);
  }
  return result;
}

function assertFactShape(member: SyncGroupMemberPayload) {
  const required = [member.approved_by_device_id, member.authorization_id, member.device_kind,
    member.device_name, member.joined_at];
  if (required.some((value) => !value.trim())) throw new Error('sync_group_member_fact_invalid');
  if (member.state === 'active' && !member.activated_at?.trim()) {
    throw new Error('sync_group_member_fact_invalid');
  }
  if (member.state === 'provisioning' && member.activated_at !== null) {
    throw new Error('sync_group_member_fact_invalid');
  }
}

function assertSameAuthorization(current: SyncGroupMemberPayload, incoming: SyncGroupMemberPayload) {
  if (IMMUTABLE_FIELDS.some((field) => current[field] !== incoming[field])) {
    throw new Error('sync_group_member_authorization_conflict');
  }
}

function mergeExistingFact(
  current: SyncGroupMemberPayload,
  incoming: SyncGroupMemberPayload,
  submittedByDeviceId: string
) {
  assertSameAuthorization(current, incoming);
  if (current.state === incoming.state) {
    if (current.activated_at !== incoming.activated_at) {
      throw new Error('sync_group_member_authorization_conflict');
    }
    return current;
  }
  if (current.state === 'left') throw new Error('sync_group_member_left_terminal');
  if (incoming.state === 'left') {
    if (submittedByDeviceId !== current.device_id) throw new Error('sync_group_member_leave_not_authorized');
    return incoming;
  }
  if (current.state === 'provisioning' && incoming.state === 'active') {
    if (![current.approved_by_device_id, current.device_id].includes(submittedByDeviceId)) {
      throw new Error('sync_group_member_activation_not_authorized');
    }
    return incoming;
  }
  throw new Error('sync_group_member_state_regression');
}

export function mergeSyncGroupMemberFacts(args: MergeSyncGroupMemberFactsArgs) {
  const current = memberMap(args.currentMembers);
  const incoming = memberMap(args.incomingMembers);
  const submitter = current.get(args.submittedByDeviceId);
  if (!submitter || submitter.state !== 'active') throw new Error('sync_group_submitter_not_active');

  const merged = new Map(current);
  for (const fact of incoming.values()) {
    assertFactShape(fact);
    const known = current.get(fact.device_id);
    if (known) {
      merged.set(fact.device_id, mergeExistingFact(known, fact, args.submittedByDeviceId));
      continue;
    }
    if (fact.state === 'left' || fact.approved_by_device_id !== args.submittedByDeviceId) {
      throw new Error('sync_group_member_introduction_not_authorized');
    }
    merged.set(fact.device_id, fact);
  }
  return [...merged.values()].sort((left, right) =>
    left.joined_at.localeCompare(right.joined_at) || left.device_id.localeCompare(right.device_id));
}
