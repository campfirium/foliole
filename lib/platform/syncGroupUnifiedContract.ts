export const DEVICE_IDENTITY_CONTRACT_VERSION = 1;

export type DevicePathFlavor = 'posix' | 'windows';

export interface SyncGroupDeviceIdentity {
  canonical_library_path: string;
  contract_version: typeof DEVICE_IDENTITY_CONTRACT_VERSION;
  device_anchor: string;
  group_id: string;
  identity_key: string;
}

export interface SyncGroupDeviceIdentityInput {
  device_anchor: string;
  group_id: string;
  library_path: string;
  path_flavor: DevicePathFlavor;
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function parseDeviceAnchor(value: unknown) {
  if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) {
    throw new Error('device_anchor_invalid');
  }
  return value;
}

export function canonicalizeLibraryPath(value: unknown, flavor: DevicePathFlavor) {
  if (typeof value !== 'string' || !value || value.includes('\0')) {
    throw new Error('library_path_invalid');
  }
  return flavor === 'windows' ? canonicalizeWindowsPath(value) : canonicalizePosixPath(value);
}

export function createSyncGroupDeviceIdentity(
  input: SyncGroupDeviceIdentityInput
): SyncGroupDeviceIdentity {
  const groupId = requiredGroupId(input.group_id);
  const deviceAnchor = parseDeviceAnchor(input.device_anchor);
  const canonicalLibraryPath = canonicalizeLibraryPath(input.library_path, input.path_flavor);
  const identityKey = JSON.stringify([
    DEVICE_IDENTITY_CONTRACT_VERSION,
    groupId,
    deviceAnchor,
    canonicalLibraryPath
  ]);
  return {
    canonical_library_path: canonicalLibraryPath,
    contract_version: DEVICE_IDENTITY_CONTRACT_VERSION,
    device_anchor: deviceAnchor,
    group_id: groupId,
    identity_key: identityKey
  };
}

export function isSameSyncGroupDevice(
  left: SyncGroupDeviceIdentity,
  right: SyncGroupDeviceIdentity
) {
  return left.identity_key === right.identity_key;
}

function requiredGroupId(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.includes('\0')) {
    throw new Error('group_id_invalid');
  }
  return value;
}

function canonicalizePosixPath(value: string) {
  if (!value.startsWith('/')) throw new Error('library_path_not_absolute');
  const segments = normalizeSegments(value.normalize('NFC').split('/'));
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

function canonicalizeWindowsPath(value: string) {
  const normalized = normalizeWindowsNamespace(value.replaceAll('/', '\\'));
  const drive = normalized.match(/^([a-zA-Z]):\\(.*)$/u);
  if (drive) {
    const segments = normalizeSegments((drive[2] ?? '').split('\\'));
    return `${drive[1]?.toLowerCase()}:\\${segments.join('\\')}`.toLowerCase();
  }
  const unc = normalized.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/u);
  if (!unc) throw new Error('library_path_not_absolute');
  const segments = normalizeSegments((unc[3] ?? '').split('\\'));
  const suffix = segments.length > 0 ? `\\${segments.join('\\')}` : '';
  return `\\\\${unc[1]}\\${unc[2]}${suffix}`.toLowerCase();
}

function normalizeWindowsNamespace(value: string) {
  if (value.startsWith('\\\\?\\UNC\\')) return `\\\\${value.slice(8)}`;
  if (value.startsWith('\\\\?\\')) return value.slice(4);
  return value;
}

function normalizeSegments(segments: string[]) {
  const result: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      result.pop();
      continue;
    }
    result.push(segment);
  }
  return result;
}
