export interface SyncGroupRestoreEvent {
  group_id: string;
  restore_id: string;
  restored_at: string;
  source_device_identity_key: string;
}

export interface SyncGroupRestoreState {
  applied: boolean;
  event: SyncGroupRestoreEvent;
}

export function syncGroupRestorePeersReady(
  local: SyncGroupRestoreState | null, remote: SyncGroupRestoreState | null
) {
  if (!local && !remote) return true;
  return Boolean(local && remote && local.applied && remote.applied &&
    local.event.restore_id === remote.event.restore_id);
}

export function parseSyncGroupRestoreEvent(value: unknown): SyncGroupRestoreEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const event = value as Partial<SyncGroupRestoreEvent>;
  if (!required(event.group_id) || !required(event.restore_id) ||
      !required(event.source_device_identity_key) || !canonicalTime(event.restored_at)) return invalid();
  return {
    group_id: event.group_id,
    restore_id: event.restore_id,
    restored_at: event.restored_at,
    source_device_identity_key: event.source_device_identity_key
  } as SyncGroupRestoreEvent;
}

export function compareSyncGroupRestoreEvents(
  left: SyncGroupRestoreEvent,
  right: SyncGroupRestoreEvent
) {
  if (left.group_id !== right.group_id) throw new Error('sync_group_restore_group_mismatch');
  const compare = (a: string, b: string) => a === b ? 0 : a > b ? 1 : -1;
  return compare(left.restored_at, right.restored_at) || compare(left.restore_id, right.restore_id);
}

function required(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

function canonicalTime(value: unknown): value is string {
  if (!required(value)) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}

function invalid(): never {
  throw new Error('sync_group_restore_event_invalid');
}
