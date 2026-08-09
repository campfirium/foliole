import type { SyncGroupMemberPayload, SyncGroupPayload } from '../../../../lib/platform/syncGroupContract';

function readString(raw: Record<string, unknown>, key: string) {
  return typeof raw[key] === 'string' && raw[key].trim() ? raw[key].trim() : null;
}

function normalizeMember(value: unknown): SyncGroupMemberPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const state = raw.state;
  if (state !== 'active' && state !== 'left') return null;
  const required = ['approved_by_device_id', 'authorization_id', 'device_id', 'device_kind', 'device_name', 'joined_at'];
  if (required.some((key) => !readString(raw, key))) return null;
  return {
    approved_by_device_id: readString(raw, 'approved_by_device_id')!,
    authorization_id: readString(raw, 'authorization_id')!,
    device_id: readString(raw, 'device_id')!,
    device_kind: readString(raw, 'device_kind')!,
    device_name: readString(raw, 'device_name')!,
    joined_at: readString(raw, 'joined_at')!,
    state
  };
}

export function normalizeSyncGroup(value: unknown): SyncGroupPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const localState = raw.local_member_state;
  if (localState !== 'active' && localState !== 'left') return null;
  const required = ['created_at', 'created_by_device_id', 'display_name', 'group_id', 'local_device_id', 'timeline_id'];
  if (required.some((key) => !readString(raw, key))) return null;
  return {
    created_at: readString(raw, 'created_at')!,
    created_by_device_id: readString(raw, 'created_by_device_id')!,
    display_name: readString(raw, 'display_name')!,
    group_id: readString(raw, 'group_id')!,
    local_device_id: readString(raw, 'local_device_id')!,
    local_member_state: localState,
    members: Array.isArray(raw.members) ? raw.members.map(normalizeMember).filter((item): item is SyncGroupMemberPayload => item !== null) : [],
    timeline_id: readString(raw, 'timeline_id')!
  };
}
