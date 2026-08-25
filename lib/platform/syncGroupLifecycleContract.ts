export const SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN = 't151-prepare-lifecycle-v1';
export const SYNC_GROUP_LIFECYCLE_PROTOCOL_VERSION = 4 as const;

export type SyncGroupJoinApplicationState = 'approved' | 'pending' | 'rejected' | 'waiting';
export type SyncGroupGrantState = 'consumed' | 'pending' | 'revoked';
export type SyncGroupDepartureKind = 'leave' | 'retire' | 'revoke';
export type SyncGroupDepartureState = 'pending' | 'repair' | 'sent';

export interface SyncGroupJoinApplication {
  application_public_key: string;
  created_at: string;
  group_id: string;
  installation_id: string;
  library_facts: Record<string, unknown>;
  previous_member_id: string | null;
  protocol_version: typeof SYNC_GROUP_LIFECYCLE_PROTOCOL_VERSION;
  request_id: string;
  requested_display_name: string;
  requested_platform: string;
  state: SyncGroupJoinApplicationState;
  timeline_id: string;
  updated_at: string;
}

export interface SyncGroupRosterMember {
  authorization_epoch: number;
  authorization_id: string;
  display_name: string;
  installation_id: string;
  member_id: string;
  platform: string;
  role: 'manager' | 'member';
  state: 'active' | 'left' | 'revoked';
}

export interface SyncGroupRosterSnapshot {
  group_id: string;
  manager_member_id: string;
  members: SyncGroupRosterMember[];
  roster_revision: number;
  state: 'active' | 'retired';
  timeline_id: string;
}

export interface SyncGroupRouteGrant {
  authorization_epoch: number;
  authorization_id: string;
  created_at: string;
  encrypted_route_secret: Record<string, unknown>;
  grant_id: string;
  group_id: string;
  local_member_id: string;
  peer_member_id: string;
  request_id: string;
  roster_revision: number;
  route_id: string;
  state: SyncGroupGrantState;
  timeline_id: string;
  updated_at: string;
}

export interface SyncGroupDepartureFact {
  created_at: string;
  departure_id: string;
  group_id: string;
  kind: SyncGroupDepartureKind;
  last_error: string | null;
  member_id: string;
  roster_revision: number;
  state: SyncGroupDepartureState;
  timeline_id: string;
  updated_at: string;
}

export interface SyncGroupLifecycleApprovalInput {
  actor_member_id: string;
  authorization_id: string;
  encrypted_route_secret: Record<string, unknown>;
  grant_id: string;
  member_id: string;
  now: string;
  request_id: string;
  route_id: string;
}

export function parseSyncGroupJoinApplication(value: unknown): SyncGroupJoinApplication {
  const record = object(value, 'join_application');
  const protocolVersion = integer(record.protocol_version, 'protocol_version');
  if (protocolVersion !== SYNC_GROUP_LIFECYCLE_PROTOCOL_VERSION) throw invalid('protocol_version');
  const state = string(record.state, 'state');
  if (!['approved', 'pending', 'rejected', 'waiting'].includes(state)) throw invalid('state');
  return {
    application_public_key: string(record.application_public_key, 'application_public_key'),
    created_at: string(record.created_at, 'created_at'),
    group_id: string(record.group_id, 'group_id'),
    installation_id: string(record.installation_id, 'installation_id'),
    library_facts: object(record.library_facts, 'library_facts'),
    previous_member_id: optionalString(record.previous_member_id, 'previous_member_id'),
    protocol_version: SYNC_GROUP_LIFECYCLE_PROTOCOL_VERSION,
    request_id: string(record.request_id, 'request_id'),
    requested_display_name: string(record.requested_display_name, 'requested_display_name'),
    requested_platform: string(record.requested_platform, 'requested_platform'),
    state: state as SyncGroupJoinApplicationState,
    timeline_id: string(record.timeline_id, 'timeline_id'),
    updated_at: string(record.updated_at, 'updated_at')
  };
}

export function parseSyncGroupRouteGrant(value: unknown): SyncGroupRouteGrant {
  const record = object(value, 'route_grant');
  const state = string(record.state, 'state');
  if (!['consumed', 'pending', 'revoked'].includes(state)) throw invalid('state');
  return {
    authorization_epoch: positiveInteger(record.authorization_epoch, 'authorization_epoch'),
    authorization_id: string(record.authorization_id, 'authorization_id'),
    created_at: string(record.created_at, 'created_at'),
    encrypted_route_secret: object(record.encrypted_route_secret, 'encrypted_route_secret'),
    grant_id: string(record.grant_id, 'grant_id'),
    group_id: string(record.group_id, 'group_id'),
    local_member_id: string(record.local_member_id, 'local_member_id'),
    peer_member_id: string(record.peer_member_id, 'peer_member_id'),
    request_id: string(record.request_id, 'request_id'),
    roster_revision: positiveInteger(record.roster_revision, 'roster_revision'),
    route_id: string(record.route_id, 'route_id'),
    state: state as SyncGroupGrantState,
    timeline_id: string(record.timeline_id, 'timeline_id'),
    updated_at: string(record.updated_at, 'updated_at')
  };
}

export function parseSyncGroupRosterSnapshot(value: unknown): SyncGroupRosterSnapshot {
  const record = object(value, 'roster');
  const state = enumValue(record.state, ['active', 'retired'], 'roster_state');
  if (!Array.isArray(record.members)) throw invalid('roster_members');
  const members = record.members.map(parseRosterMember);
  const managerMemberId = string(record.manager_member_id, 'manager_member_id');
  if (members.filter((member) => member.role === 'manager' && member.member_id === managerMemberId).length !== 1) {
    throw invalid('roster_manager');
  }
  if (new Set(members.map((member) => member.member_id)).size !== members.length ||
      new Set(members.map((member) => member.installation_id)).size !== members.length) {
    throw invalid('roster_member_identity');
  }
  return { group_id: string(record.group_id, 'group_id'), manager_member_id: managerMemberId,
    members, roster_revision: nonNegativeInteger(record.roster_revision, 'roster_revision'),
    state, timeline_id: string(record.timeline_id, 'timeline_id') };
}

export function parseSyncGroupDepartureFact(value: unknown): SyncGroupDepartureFact {
  const record = object(value, 'departure');
  return { created_at: string(record.created_at, 'created_at'),
    departure_id: string(record.departure_id, 'departure_id'),
    group_id: string(record.group_id, 'group_id'),
    kind: enumValue(record.kind, ['leave', 'retire', 'revoke'], 'departure_kind'),
    last_error: optionalString(record.last_error, 'last_error'),
    member_id: string(record.member_id, 'member_id'),
    roster_revision: nonNegativeInteger(record.roster_revision, 'roster_revision'),
    state: enumValue(record.state, ['pending', 'repair', 'sent'], 'departure_state'),
    timeline_id: string(record.timeline_id, 'timeline_id'),
    updated_at: string(record.updated_at, 'updated_at') };
}

function parseRosterMember(value: unknown): SyncGroupRosterMember {
  const record = object(value, 'roster_member');
  return { authorization_epoch: positiveInteger(record.authorization_epoch, 'authorization_epoch'),
    authorization_id: string(record.authorization_id, 'authorization_id'),
    display_name: string(record.display_name, 'display_name'),
    installation_id: string(record.installation_id, 'installation_id'),
    member_id: string(record.member_id, 'member_id'),
    platform: string(record.platform, 'platform'),
    role: enumValue(record.role, ['manager', 'member'], 'member_role'),
    state: enumValue(record.state, ['active', 'left', 'revoked'], 'member_state') };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(name);
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw invalid(name);
  return value.trim();
}

function optionalString(value: unknown, name: string) {
  if (value === null || value === undefined) return null;
  return string(value, name);
}

function integer(value: unknown, name: string) {
  if (!Number.isSafeInteger(value)) throw invalid(name);
  return Number(value);
}

function positiveInteger(value: unknown, name: string) {
  const result = integer(value, name);
  if (result < 1) throw invalid(name);
  return result;
}

function nonNegativeInteger(value: unknown, name: string) {
  const result = integer(value, name);
  if (result < 0) throw invalid(name);
  return result;
}

function enumValue<const T extends string>(value: unknown, values: readonly T[], name: string): T {
  const result = string(value, name);
  if (!values.includes(result as T)) throw invalid(name);
  return result as T;
}

function invalid(name: string) {
  return new Error(`sync_group_lifecycle_invalid_${name}`);
}
