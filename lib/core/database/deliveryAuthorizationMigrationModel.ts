export interface DeliveryMigrationRow {
  [key: string]: unknown;
}

interface DeliveryAuthorizationMigrationInput {
  aliases?: DeliveryMigrationRow[];
  cursors: DeliveryMigrationRow[];
  departures: DeliveryMigrationRow[];
  locals: DeliveryMigrationRow[];
  members: DeliveryMigrationRow[];
  receipts: DeliveryMigrationRow[];
}

export interface DeliveryAuthorizationMigrationResult {
  cursors: DeliveryMigrationRow[];
  receipts: DeliveryMigrationRow[];
}

export function mapDeliveryRowsToAuthorizations(
  input: DeliveryAuthorizationMigrationInput
): DeliveryAuthorizationMigrationResult {
  const activeGroupId = selectActiveGroupId(input.locals);
  const currentMembers = inGroup(input.members, activeGroupId);
  const active = new Set(currentMembers
    .filter((row) => text(row.state) === 'active')
    .map((row) => text(row.authorization_id)));
  const scope = buildScope(input, activeGroupId, active);
  return {
    cursors: deduplicate(input.cursors, scope, active, cursorKey),
    receipts: deduplicate(input.receipts, scope, active, receiptKey)
  };
}

export function buildLegacyDeliveryAuthorizationAliases(members: DeliveryMigrationRow[]) {
  return members.flatMap((row) => [...new Set([
    text(row.authorization_id), text(row.device_id), text(row.device_name), text(row.host_name)
  ].filter(Boolean))].map((peerKey) => ({
    authorization_id: text(row.authorization_id),
    group_id: text(row.group_id),
    peer_key: peerKey
  })));
}

function buildScope(input: DeliveryAuthorizationMigrationInput, groupId: string, active: Set<string>) {
  const aliases = new Map<string, string>();
  const currentKnown = new Set<string>();
  const historicalKnown = new Set<string>();
  const remember = (row: DeliveryMigrationRow, keys: unknown[]) => {
    const target = text(row.group_id) === groupId ? currentKnown : historicalKnown;
    for (const key of keys.map(text).filter(Boolean)) target.add(key);
  };
  for (const row of input.members) {
    remember(row, [row.authorization_id, row.host_name]);
    if (text(row.group_id) === groupId) {
      registerRowAliases(aliases, row, [row.authorization_id, row.host_name]);
    }
  }
  for (const row of input.aliases ?? []) {
    remember(row, [row.peer_key]);
    if (text(row.group_id) === groupId) registerRowAliases(aliases, row, [row.peer_key]);
  }
  for (const row of input.departures) {
    remember(row, [row.authorization_id, row.host_name]);
    if (text(row.group_id) === groupId && active.has(text(row.authorization_id))) {
      registerRowAliases(aliases, row, [row.host_name]);
    }
  }
  return { aliases, currentKnown, historicalKnown };
}

function registerRowAliases(
  aliases: Map<string, string>, row: DeliveryMigrationRow, keys: unknown[]
) {
  const authorizationId = text(row.authorization_id);
  if (!authorizationId) throw new Error('delivery_authorization_missing');
  for (const key of keys.map(text).filter(Boolean)) registerAlias(aliases, key, authorizationId);
}

function registerAlias(aliases: Map<string, string>, alias: string, authorizationId: string) {
  if (!alias) return;
  const existing = aliases.get(alias);
  if (existing && existing !== authorizationId) {
    throw new Error(`delivery_authorization_ambiguous:${alias}`);
  }
  aliases.set(alias, authorizationId);
}

function deduplicate(
  rows: DeliveryMigrationRow[],
  scope: ReturnType<typeof buildScope>,
  active: Set<string>,
  keyOf: (row: DeliveryMigrationRow) => string
) {
  const migrated = new Map<string, DeliveryMigrationRow>();
  for (const row of rows) {
    const legacyKey = text(row.authorization_id ?? row.peer_id);
    if (scope.currentKnown.has(legacyKey) && scope.historicalKnown.has(legacyKey)) {
      throw new Error(`delivery_authorization_ambiguous:${legacyKey}`);
    }
    const authorizationId = scope.aliases.get(legacyKey);
    if (!authorizationId && scope.historicalKnown.has(legacyKey) && !scope.currentKnown.has(legacyKey)) {
      continue;
    }
    if (!authorizationId) throw new Error(`delivery_authorization_unmapped:${legacyKey}`);
    if (!active.has(authorizationId)) continue;
    const next: DeliveryMigrationRow = { ...row, authorization_id: authorizationId };
    delete next.peer_id;
    const key = keyOf(next);
    const previous = migrated.get(key);
    if (previous && text(previous.payload_identity) !== text(next.payload_identity)) {
      throw new Error(`delivery_payload_identity_conflict:${key}`);
    }
    if (!previous || sortValue(next) > sortValue(previous)) migrated.set(key, next);
  }
  return [...migrated.values()];
}

function selectActiveGroupId(locals: DeliveryMigrationRow[]) {
  const active = [...new Set(locals
    .filter((row) => text(row.member_state) === 'active')
    .map((row) => text(row.group_id)).filter(Boolean))];
  if (active.length > 1) throw new Error('delivery_active_group_ambiguous');
  return active[0] ?? '';
}

function inGroup(rows: DeliveryMigrationRow[], groupId: string) {
  return rows.filter((row) => text(row.group_id) === groupId);
}

function receiptKey(row: DeliveryMigrationRow) {
  return [row.authorization_id, row.stream_name, row.operation_id].map(text).join('\u0000');
}

function cursorKey(row: DeliveryMigrationRow) {
  return [row.authorization_id, row.stream_name].map(text).join('\u0000');
}

function sortValue(row: DeliveryMigrationRow) {
  return [row.updated_at, row.created_at, row.status, row.remote_position].map(text).join('\u0000');
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}
