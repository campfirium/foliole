import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { columnExists, tableExists } from './numberedMigrationHelpers.js';

const HOST_KEY = 'host_name';
const LEGACY_HOST_KEYS = ['device_id', 'desktop_device_id'] as const;

export function migrateHostPermanentState(sqlite: DatabaseMigrationTarget) {
  renameHostStateSchema(sqlite);
  const previousHostName = readPreviousHostName(sqlite);
  if (previousHostName) {
    pruneLegacyScopes(sqlite, previousHostName);
    sqlite.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(HOST_KEY, JSON.stringify(previousHostName), new Date(0).toISOString());
  } else if (hasScopedRows(sqlite)) {
    throw new Error('host_state_migration_identity_missing');
  }
}

function renameHostStateSchema(sqlite: DatabaseMigrationTarget) {
  if (tableExists(sqlite, 'node_reading_device_state') && !tableExists(sqlite, 'node_reading_host_state')) {
    sqlite.exec('ALTER TABLE node_reading_device_state RENAME TO node_reading_host_state');
  }
  renameColumn(sqlite, 'node_reading_host_state', 'device_id', 'host_name');
  renameColumn(sqlite, 'node_view_state', 'device_id', 'host_name');
  renameColumn(sqlite, 'setting_records', 'device_id', 'host_name');
  if (tableExists(sqlite, 'setting_records')) {
    sqlite.exec("UPDATE setting_records SET scope = 'host' WHERE scope = 'device'");
    sqlite.exec('DROP INDEX IF EXISTS idx_setting_records_device');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_setting_records_host ON setting_records (host_name, updated_at)');
  }
}

function renameColumn(sqlite: DatabaseMigrationTarget, table: string, from: string, to: string) {
  if (tableExists(sqlite, table) && columnExists(sqlite, table, from) && !columnExists(sqlite, table, to)) {
    sqlite.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
}

function pruneLegacyScopes(sqlite: DatabaseMigrationTarget, previousHostName: string) {
  for (const table of ['node_reading_host_state', 'node_view_state']) {
    if (tableExists(sqlite, table)) sqlite.prepare(`DELETE FROM ${table} WHERE host_name <> ?`).run(previousHostName);
  }
  if (tableExists(sqlite, 'setting_records')) {
    sqlite.prepare("DELETE FROM setting_records WHERE scope <> 'user_space' AND host_name <> ?").run(previousHostName);
  }
}

function readPreviousHostName(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return null;
  for (const key of [HOST_KEY, ...LEGACY_HOST_KEYS]) {
    const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').all(key)[0] as { value?: string } | undefined;
    const value = parseText(row?.value);
    if (value) return value;
  }
  return null;
}

function parseText(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return value.trim() || null;
  }
}

function hasScopedRows(sqlite: DatabaseMigrationTarget) {
  return ['node_reading_host_state', 'node_view_state', 'setting_records'].some((table) =>
    tableExists(sqlite, table) && Boolean(sqlite.prepare(`SELECT 1 FROM ${table} LIMIT 1`).all()[0])
  );
}
