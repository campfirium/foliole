import { SYSTEM_ENTRY_DISPLAY_NAMES_SYNC_CAPABILITY } from './systemEntryDisplayNameContract.js';

export const SYNC_PROTOCOL_TXT_KEYS = {
  maxSupportedVersion: 'protocol_max_version',
  minSupportedVersion: 'protocol_min_version',
  version: 'protocol_version'
} as const;

export const CURRENT_SYNC_PROTOCOL_DESCRIPTOR = Object.freeze({
  capabilities: Object.freeze([
    'author-host-snapshots-v1',
    'authorization-credential-routing-v1',
    'authorization-delivery-receipts-v1',
    'host-workgroup-members-v1',
    'lan-sync-v1',
    'opaque-sync-refs-v1',
    'source-host-ownership-v1',
    'sync-group-facts-v1',
    SYSTEM_ENTRY_DISPLAY_NAMES_SYNC_CAPABILITY,
    'workgroup-aead-v1'
  ]),
  max_supported_version: 3,
  min_supported_version: 3,
  version: 3
} as const satisfies SyncProtocolDescriptor);

export const REQUIRED_SYNC_PROTOCOL_CAPABILITIES = CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities;

export type SyncProtocolDescriptor = {
  capabilities: string[] | readonly string[];
  max_supported_version: number;
  min_supported_version: number;
  version: number;
};

export type SyncProtocolVersionHint = Omit<SyncProtocolDescriptor, 'capabilities'>;

export type SyncProtocolCompatibilityReason =
  | 'protocol_metadata_missing'
  | 'protocol_metadata_invalid'
  | 'protocol_version_unsupported'
  | 'required_capability_missing'
  | 'protocol_advertisement_mismatch';

export type SyncProtocolCompatibilityResult = {
  missing_capabilities: string[];
  negotiated_version: number | null;
  reason: SyncProtocolCompatibilityReason | null;
  status: 'compatible' | 'incompatible';
};

function incompatible(
  reason: SyncProtocolCompatibilityReason,
  missingCapabilities: string[] = []
): SyncProtocolCompatibilityResult {
  return {
    missing_capabilities: missingCapabilities,
    negotiated_version: null,
    reason,
    status: 'incompatible'
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function normalizeCapabilities(value: unknown) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    return null;
  }
  return [...new Set(value.map((entry) => entry.trim()))].sort();
}

function parseVersionHint(value: unknown): SyncProtocolVersionHint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isPositiveInteger(raw.version) || !isPositiveInteger(raw.min_supported_version) ||
      !isPositiveInteger(raw.max_supported_version) ||
      raw.min_supported_version > raw.max_supported_version) return null;
  return {
    max_supported_version: raw.max_supported_version,
    min_supported_version: raw.min_supported_version,
    version: raw.version
  };
}

function versionsCompatible(remote: SyncProtocolVersionHint, local: SyncProtocolVersionHint) {
  return remote.version === local.version &&
    local.version >= remote.min_supported_version && local.version <= remote.max_supported_version &&
    remote.version >= local.min_supported_version && remote.version <= local.max_supported_version;
}

export function parseSyncProtocolDescriptor(value: unknown): SyncProtocolDescriptor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const capabilities = normalizeCapabilities(raw.capabilities);
  if (
    !capabilities ||
    !isPositiveInteger(raw.version) ||
    !isPositiveInteger(raw.min_supported_version) ||
    !isPositiveInteger(raw.max_supported_version) ||
    raw.min_supported_version > raw.max_supported_version
  ) {
    return null;
  }
  return {
    capabilities,
    max_supported_version: raw.max_supported_version,
    min_supported_version: raw.min_supported_version,
    version: raw.version
  };
}

export function evaluateSyncProtocolCompatibility(
  remoteValue: unknown,
  localValue: SyncProtocolDescriptor = CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  requiredCapabilities: readonly string[] = REQUIRED_SYNC_PROTOCOL_CAPABILITIES
): SyncProtocolCompatibilityResult {
  if (remoteValue === null || remoteValue === undefined) return incompatible('protocol_metadata_missing');
  const remote = parseSyncProtocolDescriptor(remoteValue);
  const local = parseSyncProtocolDescriptor(localValue);
  if (!remote || !local) return incompatible('protocol_metadata_invalid');
  if (!versionsCompatible(remote, local)) return incompatible('protocol_version_unsupported');
  const localMissingCapabilities = requiredCapabilities.filter((capability) => !local.capabilities.includes(capability));
  if (localMissingCapabilities.length > 0) return incompatible('protocol_metadata_invalid');
  const missingCapabilities = requiredCapabilities.filter((capability) => !remote.capabilities.includes(capability));
  if (missingCapabilities.length > 0) return incompatible('required_capability_missing', missingCapabilities);
  return {
    missing_capabilities: [],
    negotiated_version: local.version,
    reason: null,
    status: 'compatible'
  };
}

export function serializeSyncProtocolTxt(descriptor: SyncProtocolDescriptor = CURRENT_SYNC_PROTOCOL_DESCRIPTOR) {
  const normalized = parseSyncProtocolDescriptor(descriptor);
  if (!normalized) throw new Error('Invalid sync protocol descriptor.');
  return {
    [SYNC_PROTOCOL_TXT_KEYS.maxSupportedVersion]: String(normalized.max_supported_version),
    [SYNC_PROTOCOL_TXT_KEYS.minSupportedVersion]: String(normalized.min_supported_version),
    [SYNC_PROTOCOL_TXT_KEYS.version]: String(normalized.version)
  };
}

export function parseSyncProtocolTxt(value: unknown): SyncProtocolVersionHint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const readText = (key: string) => typeof raw[key] === 'string' ? raw[key].trim() : '';
  return parseVersionHint({
    max_supported_version: Number(readText(SYNC_PROTOCOL_TXT_KEYS.maxSupportedVersion)),
    min_supported_version: Number(readText(SYNC_PROTOCOL_TXT_KEYS.minSupportedVersion)),
    version: Number(readText(SYNC_PROTOCOL_TXT_KEYS.version))
  });
}

export function evaluateSyncProtocolVersionHint(
  remoteValue: unknown,
  localValue: SyncProtocolVersionHint = CURRENT_SYNC_PROTOCOL_DESCRIPTOR
): SyncProtocolCompatibilityResult {
  if (remoteValue === null || remoteValue === undefined) return incompatible('protocol_metadata_missing');
  const remote = parseVersionHint(remoteValue);
  const local = parseVersionHint(localValue);
  if (!remote || !local) return incompatible('protocol_metadata_invalid');
  if (!versionsCompatible(remote, local)) return incompatible('protocol_version_unsupported');
  return { missing_capabilities: [], negotiated_version: local.version, reason: null, status: 'compatible' };
}

export function syncProtocolVersionHintMatchesDescriptor(hintValue: unknown, descriptorValue: unknown) {
  const hint = parseVersionHint(hintValue);
  const descriptor = parseSyncProtocolDescriptor(descriptorValue);
  return Boolean(hint && descriptor && hint.version === descriptor.version &&
    hint.min_supported_version === descriptor.min_supported_version &&
    hint.max_supported_version === descriptor.max_supported_version);
}

export function syncProtocolDescriptorsMatch(leftValue: unknown, rightValue: unknown) {
  const left = parseSyncProtocolDescriptor(leftValue);
  const right = parseSyncProtocolDescriptor(rightValue);
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}
