export const SYNC_ACCEPTANCE_SNAPSHOT_VERSION = 2 as const;
export const SYNC_ACCEPTANCE_CAPABILITY = 'sync_acceptance_snapshot_v2' as const;

export type SyncAcceptanceHost = 'android' | 'desktop' | 'ios' | 'windows';
export type SyncAcceptanceBaseline = 'existing_sync' | 'fresh_join' | 'rejoin' | 'unsupported';
export type SyncDeviceState = 'absent' | 'active' | 'left';
export type SyncGroupKeySignability = 'absent' | 'invalid' | 'signable';
export type SyncDeliveryRoute = 'absent' | 'ready' | 'unavailable';
export type SyncResourceState = 'complete' | 'failed' | 'pending';

export interface SyncAcceptanceProjectionFacts {
  device_id_digest: string;
  device_state: SyncDeviceState;
  group_id_digest: string | null;
  group_key_signability: SyncGroupKeySignability;
  host: SyncAcceptanceHost;
  local_dirty_count: number;
  pack_cursor: number | null;
  pending_ack_count: number;
  resources: SyncResourceState;
  route: SyncDeliveryRoute;
}

export interface SyncAcceptanceSnapshot {
  capabilities: [typeof SYNC_ACCEPTANCE_CAPABILITY];
  delivery: {
    local_dirty_count: number;
    pack_cursor: number | null;
    pending_ack_count: number;
    resources: SyncResourceState;
    route: SyncDeliveryRoute;
  };
  group: {
    device_state: SyncDeviceState;
    group_id_digest: string | null;
    group_key_signability: SyncGroupKeySignability;
  };
  host: SyncAcceptanceHost;
  identity: { device_id_digest: string };
  journey_baseline: SyncAcceptanceBaseline;
  schema_version: typeof SYNC_ACCEPTANCE_SNAPSHOT_VERSION;
}

export type SyncAcceptanceParseResult =
  { ok: true; value: SyncAcceptanceSnapshot } |
  { ok: false; reason: 'baseline_conflict' | 'missing_or_invalid_field' | 'secret_field' |
    'unknown_version' | 'unsupported_baseline' };

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const FORBIDDEN_KEY_PATTERN =
  /^(?:credential|credential_value|database_path|device_id|key_material|passphrase|password|private_key|raw_secret|secret|token|workgroup_key)$/iu;

export function projectSyncAcceptanceSnapshot(facts: SyncAcceptanceProjectionFacts): SyncAcceptanceSnapshot {
  return {
    capabilities: [SYNC_ACCEPTANCE_CAPABILITY],
    delivery: {
      local_dirty_count: facts.local_dirty_count,
      pack_cursor: facts.pack_cursor,
      pending_ack_count: facts.pending_ack_count,
      resources: facts.resources,
      route: facts.route
    },
    group: {
      device_state: facts.device_state,
      group_id_digest: facts.group_id_digest,
      group_key_signability: facts.group_key_signability
    },
    host: facts.host,
    identity: { device_id_digest: facts.device_id_digest },
    journey_baseline: resolveSyncAcceptanceBaseline(facts),
    schema_version: SYNC_ACCEPTANCE_SNAPSHOT_VERSION
  };
}

export function parseSyncAcceptanceSnapshot(value: unknown): SyncAcceptanceParseResult {
  if (containsForbiddenKey(value)) return { ok: false, reason: 'secret_field' };
  if (!isRecord(value) || value.schema_version !== SYNC_ACCEPTANCE_SNAPSHOT_VERSION) {
    return { ok: false, reason: 'unknown_version' };
  }
  if (!hasValidShape(value)) return { ok: false, reason: 'missing_or_invalid_field' };
  const snapshot = value as unknown as SyncAcceptanceSnapshot;
  const baseline = resolveSyncAcceptanceBaseline(toProjectionFacts(snapshot));
  if (snapshot.journey_baseline !== baseline) return { ok: false, reason: 'baseline_conflict' };
  if (baseline === 'unsupported') return { ok: false, reason: 'unsupported_baseline' };
  return { ok: true, value: snapshot };
}

export function resolveSyncAcceptanceBaseline(facts: SyncAcceptanceProjectionFacts): SyncAcceptanceBaseline {
  if (!facts.group_id_digest && facts.device_state === 'absent' &&
      facts.group_key_signability === 'absent' && facts.route === 'absent' && facts.pack_cursor === null) {
    return 'fresh_join';
  }
  if (facts.group_id_digest && facts.device_state === 'active' &&
      facts.group_key_signability === 'signable' && facts.route === 'ready') return 'existing_sync';
  if (facts.group_id_digest && facts.device_state === 'left' &&
      facts.group_key_signability === 'absent' && facts.route === 'ready') return 'rejoin';
  return 'unsupported';
}

function toProjectionFacts(snapshot: SyncAcceptanceSnapshot): SyncAcceptanceProjectionFacts {
  return { ...snapshot.delivery, ...snapshot.group, device_id_digest: snapshot.identity.device_id_digest,
    host: snapshot.host };
}

function hasValidShape(value: Record<string, unknown>) {
  if (!isRecord(value.identity) || !isRecord(value.group) || !isRecord(value.delivery)) return false;
  const group = value.group;
  const delivery = value.delivery;
  return hasExactKeys(value, ['capabilities', 'delivery', 'group', 'host', 'identity', 'journey_baseline', 'schema_version']) &&
    hasExactKeys(value.identity, ['device_id_digest']) &&
    hasExactKeys(group, ['device_state', 'group_id_digest', 'group_key_signability']) &&
    hasExactKeys(delivery, ['local_dirty_count', 'pack_cursor', 'pending_ack_count', 'resources', 'route']) &&
    Array.isArray(value.capabilities) && value.capabilities.length === 1 &&
    value.capabilities[0] === SYNC_ACCEPTANCE_CAPABILITY &&
    isOneOf(value.host, ['android', 'desktop', 'ios', 'windows']) &&
    DIGEST_PATTERN.test(String(value.identity.device_id_digest)) && isDigestOrNull(group.group_id_digest) &&
    isOneOf(group.device_state, ['absent', 'active', 'left']) &&
    isOneOf(group.group_key_signability, ['absent', 'invalid', 'signable']) &&
    isOneOf(delivery.route, ['absent', 'ready', 'unavailable']) &&
    isOneOf(delivery.resources, ['complete', 'failed', 'pending']) &&
    isNonNegativeInteger(delivery.local_dirty_count) && isNonNegativeInteger(delivery.pending_ack_count) &&
    (delivery.pack_cursor === null || isNonNegativeInteger(delivery.pack_cursor)) &&
    isOneOf(value.journey_baseline, ['existing_sync', 'fresh_join', 'rejoin', 'unsupported']);
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_KEY_PATTERN.test(key) || containsForbiddenKey(child));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const sorted = [...expected].sort();
  return Object.keys(value).sort().every((key, index, keys) =>
    keys.length === sorted.length && key === sorted[index]);
}
function isDigestOrNull(value: unknown) {
  return value === null || typeof value === 'string' && DIGEST_PATTERN.test(value);
}
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
