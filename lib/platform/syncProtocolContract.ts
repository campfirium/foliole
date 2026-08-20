export const SYNC_PROTOCOL_TXT_KEYS = {
  capabilities: 'protocol_capabilities',
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
    'workgroup-aead-v1'
  ]),
  max_supported_version: 2,
  min_supported_version: 2,
  version: 2
} as const satisfies SyncProtocolDescriptor);

export type SyncProtocolDescriptor = {
  capabilities: string[] | readonly string[];
  max_supported_version: number;
  min_supported_version: number;
  version: number;
};

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
  localValue: SyncProtocolDescriptor = CURRENT_SYNC_PROTOCOL_DESCRIPTOR
): SyncProtocolCompatibilityResult {
  if (remoteValue === null || remoteValue === undefined) return incompatible('protocol_metadata_missing');
  const remote = parseSyncProtocolDescriptor(remoteValue);
  const local = parseSyncProtocolDescriptor(localValue);
  if (!remote || !local) return incompatible('protocol_metadata_invalid');
  const versionsMatch = remote.version === local.version;
  const rangesAcceptCurrent =
    local.version >= remote.min_supported_version &&
    local.version <= remote.max_supported_version &&
    remote.version >= local.min_supported_version &&
    remote.version <= local.max_supported_version;
  if (!versionsMatch || !rangesAcceptCurrent) return incompatible('protocol_version_unsupported');
  const missingCapabilities = local.capabilities.filter((capability) => !remote.capabilities.includes(capability));
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
    [SYNC_PROTOCOL_TXT_KEYS.capabilities]: normalized.capabilities.join(','),
    [SYNC_PROTOCOL_TXT_KEYS.maxSupportedVersion]: String(normalized.max_supported_version),
    [SYNC_PROTOCOL_TXT_KEYS.minSupportedVersion]: String(normalized.min_supported_version),
    [SYNC_PROTOCOL_TXT_KEYS.version]: String(normalized.version)
  };
}

export function parseSyncProtocolTxt(value: unknown): SyncProtocolDescriptor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const readText = (key: string) => typeof raw[key] === 'string' ? raw[key].trim() : '';
  const capabilities = readText(SYNC_PROTOCOL_TXT_KEYS.capabilities).split(',').filter(Boolean);
  return parseSyncProtocolDescriptor({
    capabilities,
    max_supported_version: Number(readText(SYNC_PROTOCOL_TXT_KEYS.maxSupportedVersion)),
    min_supported_version: Number(readText(SYNC_PROTOCOL_TXT_KEYS.minSupportedVersion)),
    version: Number(readText(SYNC_PROTOCOL_TXT_KEYS.version))
  });
}

export function syncProtocolDescriptorsMatch(leftValue: unknown, rightValue: unknown) {
  const left = parseSyncProtocolDescriptor(leftValue);
  const right = parseSyncProtocolDescriptor(rightValue);
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}
