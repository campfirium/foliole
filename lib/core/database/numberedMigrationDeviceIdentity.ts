import { randomUUID } from 'node:crypto';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function migrateDeviceIdSettingKey(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return;
  const existing = readSetting(sqlite, 'device_id');
  if (parseDeviceId(existing?.value)) return;
  const legacy = readSetting(sqlite, 'desktop_device_id');
  const deviceId = parseDeviceId(legacy?.value) ?? `device-${randomUUID()}`;
  sqlite.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run('device_id', JSON.stringify(deviceId), new Date().toISOString());
}

export function migrateNodeViewStateDeviceScope(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'node_view_state')) return;
  const columns = sqlite.prepare('PRAGMA table_info(node_view_state)').all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === 'device_id')) return;

  const deviceId = ensureDesktopDeviceId(sqlite);
  sqlite.exec(`CREATE TABLE node_view_state_next (
    node_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    scroll_top INTEGER NOT NULL DEFAULT 0,
    selection_from INTEGER,
    selection_to INTEGER,
    source TEXT NOT NULL DEFAULT 'user-scroll',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (node_id, device_id)
  )`);
  sqlite.prepare(
    `INSERT INTO node_view_state_next (
       node_id, device_id, scroll_top, selection_from, selection_to, updated_at
     )
     SELECT node_id, ?, scroll_top, selection_from, selection_to, updated_at
     FROM node_view_state`
  ).run(deviceId);
  sqlite.exec('DROP TABLE node_view_state');
  sqlite.exec('ALTER TABLE node_view_state_next RENAME TO node_view_state');
}

export function migrateNodeReadingDeviceState(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'node_reading')) return;
  sqlite.exec(`CREATE TABLE IF NOT EXISTS node_reading_device_state (
    node_id TEXT NOT NULL REFERENCES nodes(id),
    device_id TEXT NOT NULL,
    reading_position INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (node_id, device_id)
  )`);
  const columns = sqlite.prepare('PRAGMA table_info(node_reading)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'reading_position')) return;

  const deviceId = ensureDesktopDeviceId(sqlite);
  sqlite.prepare(
    `INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at)
     SELECT node_id, ?, reading_position, COALESCE(last_handled_at, next_at)
     FROM node_reading
     WHERE true
     ON CONFLICT(node_id, device_id) DO UPDATE SET
       reading_position = excluded.reading_position,
       updated_at = excluded.updated_at`
  ).run(deviceId);
  sqlite.exec(`CREATE TABLE node_reading_next (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    interval_duration_ms INTEGER NOT NULL DEFAULT 0,
    interval_growth_factor REAL NOT NULL DEFAULT 1,
    last_handled_at TEXT NOT NULL,
    next_at TEXT NOT NULL,
    priority REAL NOT NULL DEFAULT 0,
    repetition_count INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'active'
  )`);
  sqlite.exec(`INSERT INTO node_reading_next (
      node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
      next_at, priority, repetition_count, state
    )
    SELECT node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
      next_at, priority, repetition_count, state
    FROM node_reading`);
  sqlite.exec('DROP TABLE node_reading');
  sqlite.exec('ALTER TABLE node_reading_next RENAME TO node_reading');
}

function ensureDesktopDeviceId(sqlite: DatabaseMigrationTarget) {
  const existingDeviceId = parseDeviceId(readSetting(sqlite, 'device_id')?.value);
  if (existingDeviceId) return existingDeviceId;
  const legacyDeviceId = parseDeviceId(readSetting(sqlite, 'desktop_device_id')?.value);
  if (legacyDeviceId) return legacyDeviceId;

  const deviceId = `device-${randomUUID()}`;
  if (tableExists(sqlite, 'settings')) {
    sqlite.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run('device_id', JSON.stringify(deviceId), new Date().toISOString());
  }
  return deviceId;
}

function readSetting(sqlite: DatabaseMigrationTarget, key: string) {
  return tableExists(sqlite, 'settings')
    ? sqlite.prepare('SELECT value FROM settings WHERE key = ?').all(key)[0] as { value?: string } | undefined
    : undefined;
}

function parseDeviceId(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return value.trim() || null;
  }
}

function tableExists(sqlite: DatabaseMigrationTarget, tableName: string) {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(tableName)[0] as { name?: string } | undefined;
  return row?.name === tableName;
}
