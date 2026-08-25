export const LEGACY_SYNC_GROUP_TABLES = [
  'sync_groups',
  'sync_group_members',
  'sync_group_member_departures',
  'sync_group_local_state',
  'sync_group_nonce_ledger'
] as const;

export const UNIFIED_SYNC_GROUP_TABLES_IN_DROP_ORDER = [
  'sync_group_nonce_ledger',
  'sync_group_departure_outbox',
  'sync_group_route_grants',
  'sync_group_peer_routes',
  'sync_group_join_applications',
  'sync_group_local_state',
  'sync_group_member_authorizations',
  'sync_group_members',
  'sync_groups',
  'sync_group_migration_journal'
] as const;

export const UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS = [
  `CREATE TABLE sync_group_migration_journal (
    journal_id TEXT PRIMARY KEY,
    contract_version INTEGER NOT NULL,
    legacy_schema_version INTEGER NOT NULL,
    target_schema_version INTEGER NOT NULL,
    decision_digest TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('db_committed', 'committed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE sync_groups (
    group_id TEXT PRIMARY KEY,
    timeline_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    manager_member_id TEXT NOT NULL,
    roster_revision INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL CHECK (state IN ('active', 'repair', 'retired')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE sync_group_members (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    installation_id TEXT,
    display_name TEXT NOT NULL,
    host_platform TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'member')),
    state TEXT NOT NULL CHECK (state IN ('active', 'left', 'repair', 'revoked')),
    identity_state TEXT NOT NULL CHECK (identity_state IN ('verified', 'legacy_identity_unverified')),
    authorization_id TEXT NOT NULL,
    authorization_epoch INTEGER NOT NULL,
    joined_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, member_id),
    UNIQUE (group_id, installation_id),
    UNIQUE (authorization_id)
  )`,
  `CREATE TABLE sync_group_member_authorizations (
    group_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    authorization_id TEXT NOT NULL,
    authorization_epoch INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'left', 'revoked', 'repair')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, member_id),
    UNIQUE (authorization_id),
    FOREIGN KEY (group_id, member_id) REFERENCES sync_group_members(group_id, member_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE sync_group_local_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    local_member_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    member_state TEXT NOT NULL CHECK (member_state IN ('active', 'left', 'repair')),
    updated_at TEXT NOT NULL,
    UNIQUE (group_id, installation_id),
    FOREIGN KEY (group_id, local_member_id) REFERENCES sync_group_members(group_id, member_id)
  )`,
  `CREATE TABLE sync_group_join_applications (
    request_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE sync_group_peer_routes (
    route_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    local_member_id TEXT NOT NULL,
    peer_member_id TEXT NOT NULL,
    peer_authorization_epoch INTEGER NOT NULL,
    endpoint_hint TEXT,
    protocol_version INTEGER NOT NULL,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (group_id, local_member_id, peer_member_id)
  )`,
  `CREATE TABLE sync_group_route_grants (
    grant_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    local_member_id TEXT NOT NULL,
    peer_member_id TEXT NOT NULL,
    authorization_epoch INTEGER NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE sync_group_departure_outbox (
    departure_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'repair', 'sent')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE sync_group_nonce_ledger (
    route_id TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (route_id, nonce)
  )`,
  `CREATE INDEX idx_sync_group_members_state
    ON sync_group_members (group_id, state, updated_at)`,
  `CREATE INDEX idx_sync_group_departure_state
    ON sync_group_departure_outbox (state, updated_at)`
] as const;

export function unifiedLegacyTableName(table: typeof LEGACY_SYNC_GROUP_TABLES[number], version: number) {
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('invalid legacy schema version');
  return `sealed_legacy_v${version}_${table}`;
}
