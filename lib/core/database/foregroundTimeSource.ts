import { z } from 'zod';

import type { ForegroundTimeBucket } from '../review/foregroundTime.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';

export const FOREGROUND_SOURCE_PREFIX = 'foreground_time_source:';
export const FOREGROUND_OWNER_SCHEMA = `CREATE TABLE IF NOT EXISTS foreground_time_owners (
  library_path TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL)`;
export const FOREGROUND_UUID_SQL = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) ||
  '-4' || substr(hex(randomblob(2)), 2) || '-8' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`;
const uuid = z.string().uuid();
const insertSource = `INSERT INTO workspace_meta(key, value, updated_at) VALUES (?, ${FOREGROUND_UUID_SQL}, ?)
  ON CONFLICT(key) DO NOTHING`;

export function loadForegroundSource(driver: DatabaseDriver, ownerId: string) {
  const key = FOREGROUND_SOURCE_PREFIX + uuid.parse(ownerId);
  driver.execute(insertSource, [key, new Date().toISOString()]);
  const row = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
  return uuid.parse(row?.value);
}

export async function loadForegroundSourceWithDbPort(db: DbPort, ownerId: string) {
  const key = FOREGROUND_SOURCE_PREFIX + uuid.parse(ownerId);
  await db.run(insertSource, [key, new Date().toISOString()]);
  const [row] = await db.query<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
  return uuid.parse(row?.value);
}

export async function loadForegroundBaseline(db: DbPort, sourceId: string): Promise<ForegroundTimeBucket[]> {
  const rows = await db.query<{ day_key: string; duration_ms: number }>(
    'SELECT day_key, duration_ms FROM foreground_daily_time WHERE source_id = ?', [sourceId]);
  return rows.map((row) => ({ day: row.day_key, durationMs: row.duration_ms }));
}

export async function renewForegroundSources(db: DbPort) {
  const [present] = await db.query('SELECT 1 AS present FROM sqlite_master WHERE name = ?', ['workspace_meta']);
  if (!present) return;
  await db.run(`UPDATE workspace_meta SET value = ${FOREGROUND_UUID_SQL}, updated_at = ? WHERE key GLOB ?`,
    [new Date().toISOString(), FOREGROUND_SOURCE_PREFIX + '*']);
}
