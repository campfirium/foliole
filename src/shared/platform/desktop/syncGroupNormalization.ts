import type {
  SyncGroupDevicePayload,
  SyncGroupPayload
} from '../../../../lib/platform/syncGroupContract';

function readString(raw: Record<string, unknown>, key: string) {
  return typeof raw[key] === 'string' && raw[key].trim() ? raw[key].trim() : null;
}

function readNullableString(raw: Record<string, unknown>, key: string) {
  return raw[key] === null ? null : readString(raw, key);
}

function normalizeDevice(value: unknown): SyncGroupDevicePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.contract_version !== 1 || (raw.state !== 'active' && raw.state !== 'left')) return null;
  const required = ['canonical_library_path', 'device_anchor', 'device_identity_key', 'device_name',
    'joined_at', 'platform', 'updated_at'];
  if (required.some((key) => !readString(raw, key))) return null;
  const lastSeenAt = readNullableString(raw, 'last_seen_at');
  const leftAt = readNullableString(raw, 'left_at');
  if ((raw.last_seen_at !== null && !lastSeenAt) || (raw.left_at !== null && !leftAt)) return null;
  return {
    canonical_library_path: readString(raw, 'canonical_library_path')!,
    contract_version: 1,
    device_anchor: readString(raw, 'device_anchor')!,
    device_identity_key: readString(raw, 'device_identity_key')!,
    device_name: readString(raw, 'device_name')!,
    joined_at: readString(raw, 'joined_at')!,
    last_seen_at: lastSeenAt,
    left_at: leftAt,
    platform: readString(raw, 'platform')!,
    state: raw.state,
    updated_at: readString(raw, 'updated_at')!
  };
}

export function normalizeSyncGroup(value: unknown): SyncGroupPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const required = ['created_at', 'display_name', 'group_id', 'local_device_identity_key'];
  if (required.some((key) => !readString(raw, key)) || !Array.isArray(raw.devices)) return null;
  const devices = raw.devices.map(normalizeDevice);
  if (devices.some((device) => device === null)) return null;
  return {
    created_at: readString(raw, 'created_at')!,
    devices: devices as SyncGroupDevicePayload[],
    display_name: readString(raw, 'display_name')!,
    group_id: readString(raw, 'group_id')!,
    local_device_identity_key: readString(raw, 'local_device_identity_key')!
  };
}
