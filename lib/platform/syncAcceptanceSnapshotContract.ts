export const SYNC_ACCEPTANCE_SNAPSHOT_VERSION = 1 as const;
export const SYNC_ACCEPTANCE_CAPABILITY = 'sync_acceptance_snapshot_v1' as const;

export type SyncAcceptanceHost = 'android' | 'desktop';
export type SyncAcceptanceBaseline = 'existing_sync' | 'fresh_join' | 'rejoin' | 'unsupported';
export type SyncMembershipState = 'absent' | 'active' | 'left';
export type SyncAuthorizationState = 'active' | 'none' | 'pending';
export type SyncCredentialSignability = 'absent' | 'invalid' | 'signable';
export type SyncDeliveryRoute = 'absent' | 'ready' | 'unavailable';
export type SyncResourceState = 'complete' | 'failed' | 'pending';

export interface SyncAcceptanceProjectionFacts {
  authorization: SyncAuthorizationState;
  credential_signability: SyncCredentialSignability;
  device_id_digest: string;
  group_id_digest: string | null;
  host: SyncAcceptanceHost;
  local_dirty_count: number;
  membership: SyncMembershipState;
  pack_cursor: number | null;
  pending_ack_count: number;
  resources: SyncResourceState;
  route: SyncDeliveryRoute;
  timeline_id_digest: string | null;
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
    authorization: SyncAuthorizationState;
    credential_signability: SyncCredentialSignability;
    group_id_digest: string | null;
    membership: SyncMembershipState;
    timeline_id_digest: string | null;
  };
  host: SyncAcceptanceHost;
  identity: { device_id_digest: string };
  journey_baseline: SyncAcceptanceBaseline;
  schema_version: typeof SYNC_ACCEPTANCE_SNAPSHOT_VERSION;
}

export type SyncAcceptanceParseFailure =
  | 'baseline_conflict'
  | 'missing_or_invalid_field'
  | 'secret_field'
  | 'unknown_version'
  | 'unsupported_baseline';

export type SyncAcceptanceParseResult =
  { ok: true; value: SyncAcceptanceSnapshot } | { ok: false; reason: SyncAcceptanceParseFailure };

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const FORBIDDEN_KEY_PATTERN =
  /^(?:credential|credential_value|database_path|device_id|key_material|passphrase|password|private_key|raw_secret|secret|token|workgroup_key)$/iu;

export function projectSyncAcceptanceSnapshot(
  facts: SyncAcceptanceProjectionFacts
): SyncAcceptanceSnapshot {
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
      authorization: facts.authorization,
      credential_signability: facts.credential_signability,
      group_id_digest: facts.group_id_digest,
      membership: facts.membership,
      timeline_id_digest: facts.timeline_id_digest
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
  const derivedBaseline = resolveSyncAcceptanceBaseline(toProjectionFacts(snapshot));
  if (snapshot.journey_baseline !== derivedBaseline)
    return { ok: false, reason: 'baseline_conflict' };
  if (derivedBaseline === 'unsupported') return { ok: false, reason: 'unsupported_baseline' };
  return { ok: true, value: snapshot };
}

export function resolveSyncAcceptanceBaseline(
  facts: SyncAcceptanceProjectionFacts
): SyncAcceptanceBaseline {
  if (matchesFreshJoin(facts)) return 'fresh_join';
  if (matchesExistingSync(facts)) return 'existing_sync';
  if (matchesRejoin(facts)) return 'rejoin';
  return 'unsupported';
}

function matchesFreshJoin(facts: SyncAcceptanceProjectionFacts) {
  return (
    !facts.group_id_digest &&
    !facts.timeline_id_digest &&
    facts.membership === 'absent' &&
    facts.authorization === 'none' &&
    facts.credential_signability === 'absent' &&
    facts.route === 'absent' &&
    facts.pack_cursor === null
  );
}

function matchesExistingSync(facts: SyncAcceptanceProjectionFacts) {
  return (
    hasGroupIdentity(facts) &&
    facts.membership === 'active' &&
    facts.authorization === 'active' &&
    facts.credential_signability === 'signable' &&
    facts.route === 'ready'
  );
}

function matchesRejoin(facts: SyncAcceptanceProjectionFacts) {
  return (
    hasGroupIdentity(facts) &&
    facts.membership === 'left' &&
    facts.authorization === 'none' &&
    facts.credential_signability === 'absent' &&
    facts.route === 'ready'
  );
}

function hasGroupIdentity(facts: SyncAcceptanceProjectionFacts) {
  return Boolean(facts.group_id_digest && facts.timeline_id_digest);
}

function toProjectionFacts(snapshot: SyncAcceptanceSnapshot): SyncAcceptanceProjectionFacts {
  return {
    ...snapshot.delivery,
    ...snapshot.group,
    device_id_digest: snapshot.identity.device_id_digest,
    host: snapshot.host
  };
}

function hasValidShape(value: Record<string, unknown>): boolean {
  if (!isRecord(value.identity) || !isRecord(value.group) || !isRecord(value.delivery))
    return false;
  const capabilities = value.capabilities;
  const group = value.group;
  const delivery = value.delivery;
  return (
    hasExactKeys(value, [
      'capabilities',
      'delivery',
      'group',
      'host',
      'identity',
      'journey_baseline',
      'schema_version'
    ]) &&
    hasExactKeys(value.identity, ['device_id_digest']) &&
    hasExactKeys(group, [
      'authorization',
      'credential_signability',
      'group_id_digest',
      'membership',
      'timeline_id_digest'
    ]) &&
    hasExactKeys(delivery, [
      'local_dirty_count',
      'pack_cursor',
      'pending_ack_count',
      'resources',
      'route'
    ]) &&
    Array.isArray(capabilities) &&
    capabilities.length === 1 &&
    capabilities[0] === SYNC_ACCEPTANCE_CAPABILITY &&
    isOneOf(value.host, ['android', 'desktop']) &&
    DIGEST_PATTERN.test(String(value.identity.device_id_digest)) &&
    isDigestOrNull(group.group_id_digest) &&
    isDigestOrNull(group.timeline_id_digest) &&
    isOneOf(group.membership, ['absent', 'active', 'left']) &&
    isOneOf(group.authorization, ['active', 'none', 'pending']) &&
    isOneOf(group.credential_signability, ['absent', 'invalid', 'signable']) &&
    isOneOf(delivery.route, ['absent', 'ready', 'unavailable']) &&
    isOneOf(delivery.resources, ['complete', 'failed', 'pending']) &&
    isNonNegativeInteger(delivery.local_dirty_count) &&
    isNonNegativeInteger(delivery.pending_ack_count) &&
    (delivery.pack_cursor === null || isNonNegativeInteger(delivery.pack_cursor)) &&
    isOneOf(value.journey_baseline, ['existing_sync', 'fresh_join', 'rejoin', 'unsupported'])
  );
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => FORBIDDEN_KEY_PATTERN.test(key) || containsForbiddenKey(child)
  );
}

function isDigestOrNull(value: unknown) {
  return value === null || (typeof value === 'string' && DIGEST_PATTERN.test(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
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
