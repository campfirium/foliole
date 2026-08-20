export interface DeliveryMigrationRow {
  [key: string]: unknown;
}

interface DeliveryAuthorizationMigrationInput {
  cursors: DeliveryMigrationRow[];
  departures: DeliveryMigrationRow[];
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
  const aliases = buildAuthorizationAliases(input.members, input.departures);
  const active = new Set(input.members
    .filter((row) => text(row.state) === 'active')
    .map((row) => text(row.authorization_id)));
  return {
    cursors: deduplicate(input.cursors, aliases, active, cursorKey),
    receipts: deduplicate(input.receipts, aliases, active, receiptKey)
  };
}

function buildAuthorizationAliases(members: DeliveryMigrationRow[], departures: DeliveryMigrationRow[]) {
  const aliases = new Map<string, string>();
  for (const row of [...members, ...departures]) {
    const authorizationId = text(row.authorization_id);
    if (!authorizationId) throw new Error('delivery_authorization_missing');
    registerAlias(aliases, authorizationId, authorizationId);
    registerAlias(aliases, text(row.host_name), authorizationId);
  }
  return aliases;
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
  aliases: Map<string, string>,
  active: Set<string>,
  keyOf: (row: DeliveryMigrationRow) => string
) {
  const migrated = new Map<string, DeliveryMigrationRow>();
  for (const row of rows) {
    const legacyKey = text(row.authorization_id ?? row.peer_id);
    const authorizationId = aliases.get(legacyKey);
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
