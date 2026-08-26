import type { CompanionPairingSecretPayload } from './nativeCompanionSyncContract.js';
import {
  canonicalizeLibraryPath,
  parseDeviceAnchor,
  type DevicePathFlavor
} from './syncGroupUnifiedContract.js';

export const SYNC_GROUP_JOIN_REQUEST_TTL_MS = 2 * 60 * 1000;
export const SYNC_GROUP_JOIN_CONTRACT_VERSION = 1;

export interface SyncGroupJoinDeviceFacts {
  canonical_library_path: string;
  device_anchor: string;
  device_name: string;
  path_flavor: DevicePathFlavor;
  platform: string;
}

export interface SyncGroupJoinRequestInput {
  contract_version: typeof SYNC_GROUP_JOIN_CONTRACT_VERSION;
  device: SyncGroupJoinDeviceFacts;
  ephemeral_public_key: string;
  group_id: string;
}

export interface SyncGroupJoinRequest extends SyncGroupJoinRequestInput {
  expires_at: string;
  request_id: string;
  requested_at: string;
  status: 'accepted' | 'pending';
}

export interface SyncGroupJoinGroupInfo {
  display_name: string;
  group_id: string;
  workgroup_key: string;
}

export interface SyncGroupJoinAcceptance {
  encrypted_group_info: CompanionPairingSecretPayload;
  expires_at: string;
  request_id: string;
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export function parseSyncGroupJoinRequestInput(value: unknown): SyncGroupJoinRequestInput {
  const raw = record(value, 'sync_group_join_request_invalid');
  exactKeys(raw, ['contract_version', 'device', 'ephemeral_public_key', 'group_id']);
  if (raw.contract_version !== SYNC_GROUP_JOIN_CONTRACT_VERSION) {
    throw new Error('sync_group_join_contract_incompatible');
  }
  return {
    contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
    device: parseDeviceFacts(raw.device),
    ephemeral_public_key: parseP256PublicKey(raw.ephemeral_public_key),
    group_id: requiredString(raw.group_id, 'group_id_invalid')
  };
}

export function parseSyncGroupJoinGroupInfo(value: unknown): SyncGroupJoinGroupInfo {
  const raw = record(value, 'sync_group_join_group_info_invalid');
  exactKeys(raw, ['display_name', 'group_id', 'workgroup_key']);
  const workgroupKey = requiredString(raw.workgroup_key, 'workgroup_key_invalid');
  if (decodeBase64Url(workgroupKey).byteLength !== 32) throw new Error('workgroup_key_invalid');
  return {
    display_name: requiredString(raw.display_name, 'group_display_name_invalid'),
    group_id: requiredString(raw.group_id, 'group_id_invalid'),
    workgroup_key: workgroupKey
  };
}

export function parseSyncGroupJoinRequestId(value: unknown) {
  if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) {
    throw new Error('sync_group_join_request_id_invalid');
  }
  return value;
}

export function isSyncGroupJoinRequestExpired(request: Pick<SyncGroupJoinRequest, 'expires_at'>, nowMs = Date.now()) {
  const expiresAt = Date.parse(request.expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= nowMs;
}

function parseDeviceFacts(value: unknown): SyncGroupJoinDeviceFacts {
  const raw = record(value, 'sync_group_join_device_invalid');
  exactKeys(raw, ['canonical_library_path', 'device_anchor', 'device_name', 'path_flavor', 'platform']);
  const flavor = raw.path_flavor;
  if (flavor !== 'posix' && flavor !== 'windows') throw new Error('library_path_flavor_invalid');
  const path = requiredString(raw.canonical_library_path, 'library_path_invalid');
  if (canonicalizeLibraryPath(path, flavor) !== path) throw new Error('library_path_not_canonical');
  return {
    canonical_library_path: path,
    device_anchor: parseDeviceAnchor(raw.device_anchor),
    device_name: requiredString(raw.device_name, 'device_name_invalid'),
    path_flavor: flavor,
    platform: requiredString(raw.platform, 'device_platform_invalid')
  };
}

function parseP256PublicKey(value: unknown) {
  const key = requiredString(value, 'sync_group_join_public_key_invalid');
  const bytes = decodeBase64Url(key);
  if (bytes.byteLength !== 65 || bytes[0] !== 4) throw new Error('sync_group_join_public_key_invalid');
  return key;
}

function decodeBase64Url(value: string) {
  if (!BASE64_URL_PATTERN.test(value)) throw new Error('base64url_invalid');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('base64url_invalid');
  }
}

function requiredString(value: unknown, error: string) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.includes('\0')) {
    throw new Error(error);
  }
  return value;
}

function record(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
    throw new Error('sync_group_join_payload_shape_invalid');
  }
}
