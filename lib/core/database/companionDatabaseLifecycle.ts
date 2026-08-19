import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { rehashCompanionHostState } from './companionHostStateHashes.js';

export type CompanionJournalMode = 'delete' | 'wal';

export interface CompanionDatabaseBootstrapRequest {
  allowCreate: boolean;
  beforeVersionCommit?: () => void | Promise<void>;
  expectedHostName?: string;
  expectedJournalMode?: CompanionJournalMode;
  now: string;
}

export interface CompanionDatabaseBootstrapResult {
  created: boolean;
  deviceId: string;
  hostName: string;
  journalMode: CompanionJournalMode;
  version: number;
}

export class CompanionDatabaseBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`Companion database blocked: ${reason}`);
    this.name = 'CompanionDatabaseBlockedError';
  }
}

export async function bootstrapCompanionDatabase(
  db: DbPort,
  request: CompanionDatabaseBootstrapRequest
): Promise<CompanionDatabaseBootstrapResult> {
  await assertIntegrity(db);
  const openedJournalMode = await readJournalMode(db);
  const version = await readUserVersion(db);
  const hasSchema = await hasCompanionSchema(db);
  if (!hasSchema && !request.allowCreate) throw new CompanionDatabaseBlockedError('missing');
  if (version > COMPANION_DATABASE_VERSION) throw new CompanionDatabaseBlockedError('newer-version');
  const currentHostName = request.expectedHostName?.trim();
  if (!currentHostName) throw new CompanionDatabaseBlockedError('host-missing');
  const existingDeviceId = hasSchema ? await requireExistingDeviceIdentity(db) : currentHostName;
  const previousHostName = hasSchema
    ? await readMeta(db, 'host_name') ?? existingDeviceId
    : currentHostName;
  const journalMode = await restoreExpectedJournalMode(db, openedJournalMode, request.expectedJournalMode);
  await db.transaction(async (tx) => {
    if (!hasSchema) {
      await createCompanionDatabase(tx, COMPANION_DATABASE_VERSION, request.beforeVersionCommit);
      await writeMeta(tx, 'device_id', existingDeviceId, request.now);
      await writeMeta(tx, 'host_name', currentHostName, request.now);
    }
    else {
      await migrateCompanionDatabase(tx, version, COMPANION_DATABASE_VERSION, request.beforeVersionCommit);
      await transferCompanionHostState(tx, previousHostName, currentHostName, request.now);
    }
  });
  return {
    created: !hasSchema,
    deviceId: existingDeviceId,
    hostName: currentHostName,
    journalMode,
    version: COMPANION_DATABASE_VERSION
  };
}

export async function checkpointCompanionDatabase(db: DbPort, journalMode: CompanionJournalMode) {
  if (journalMode !== 'wal') return;
  const rows = await db.query<DbRow>('PRAGMA wal_checkpoint(FULL)');
  const busy = Number(Object.values(rows[0] ?? {})[0] ?? 0);
  if (busy !== 0) throw new CompanionDatabaseBlockedError('wal-checkpoint-busy');
}

async function assertIntegrity(db: DbPort) {
  let rows: DbRow[];
  try {
    rows = await db.query('PRAGMA quick_check');
  } catch (error) {
    throw new CompanionDatabaseBlockedError(`unreadable:${message(error)}`);
  }
  const result = String(Object.values(rows[0] ?? {})[0] ?? '').toLowerCase();
  if (result !== 'ok') throw new CompanionDatabaseBlockedError('integrity');
}

async function readJournalMode(db: DbPort): Promise<CompanionJournalMode> {
  const rows = await db.query('PRAGMA journal_mode');
  const mode = String(Object.values(rows[0] ?? {})[0] ?? '').toLowerCase();
  if (mode === 'delete' || mode === 'wal') return mode;
  throw new CompanionDatabaseBlockedError(`journal:${mode || 'unknown'}`);
}

async function restoreExpectedJournalMode(
  db: DbPort,
  opened: CompanionJournalMode,
  expected?: CompanionJournalMode
): Promise<CompanionJournalMode> {
  if (!expected || expected === opened) return opened;
  if (expected !== 'wal' || opened !== 'delete') {
    throw new CompanionDatabaseBlockedError(`journal-mismatch:${expected}:${opened}`);
  }
  const rows = await db.query('PRAGMA journal_mode = WAL');
  const restored = String(Object.values(rows[0] ?? {})[0] ?? '').toLowerCase();
  if (restored !== 'wal') throw new CompanionDatabaseBlockedError('journal-restore-failed');
  return 'wal';
}

async function readUserVersion(db: DbPort) {
  const rows = await db.query('PRAGMA user_version');
  const value = Number(Object.values(rows[0] ?? {})[0] ?? Number.NaN);
  if (!Number.isSafeInteger(value) || value < 0) throw new CompanionDatabaseBlockedError('invalid-version');
  return value;
}

async function hasCompanionSchema(db: DbPort) {
  const rows = await db.query(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'companion_meta' LIMIT 1"
  );
  return rows.length > 0;
}

async function requireExistingDeviceIdentity(db: DbPort) {
  const stored = await readMeta(db, 'device_id');
  if (stored) return stored;
  throw new CompanionDatabaseBlockedError('identity-missing');
}

async function readMeta(db: DbPort, key: string) {
  const rows = await db.query<{ value: string }>(
    'SELECT value FROM companion_meta WHERE key = ? LIMIT 1', [key]
  );
  return typeof rows[0]?.value === 'string' && rows[0].value.trim() ? rows[0].value.trim() : null;
}

async function transferCompanionHostState(db: DbPort, previous: string, current: string, now: string) {
  if (previous !== current) {
    await db.run(`INSERT OR REPLACE INTO node_reading_host_state (node_id, host_name, reading_position, updated_at)
      SELECT node_id, ?, reading_position, updated_at FROM node_reading_host_state WHERE host_name = ?`, [current, previous]);
    await db.run(`INSERT OR REPLACE INTO node_view_state
      (node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at)
      SELECT node_id, ?, scroll_top, selection_from, selection_to, source, updated_at
      FROM node_view_state WHERE host_name = ?`, [current, previous]);
    await db.run(`INSERT OR REPLACE INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at, deleted_at)
      SELECT key, scope, platform, form_factor, ?, value_json, content_hash, updated_at, deleted_at
      FROM setting_records WHERE host_name = ? AND scope <> 'user_space'`, [current, previous]);
  }
  await rewriteCompanionHostObjectIds(db, previous, current);
  await rehashCompanionHostState(db, current);
  await db.run('DELETE FROM node_reading_host_state WHERE host_name <> ?', [current]);
  await db.run('DELETE FROM node_view_state WHERE host_name <> ?', [current]);
  await db.run("DELETE FROM setting_records WHERE scope <> 'user_space' AND host_name <> ?", [current]);
  await pruneCompanionOtherHostObjectState(db, current);
  await writeMeta(db, 'host_name', current, now);
  await db.run("DELETE FROM companion_meta WHERE key = 'device_identity_reset_pending'");
}

async function pruneCompanionOtherHostObjectState(db: DbPort, current: string) {
  const rows = await db.query<{ object_id: string; object_type: string }>(
    "SELECT object_id, object_type FROM sync_object_state WHERE object_type IN ('setting', 'view_state')"
  );
  for (const row of rows) {
    const parts = row.object_id.split(':');
    const isSharedSetting = row.object_type === 'setting' && parts[0] === 'user_space';
    if (isSharedSetting || parts.length >= 5 && parts[3] === current) continue;
    await db.run('DELETE FROM sync_object_state WHERE object_type = ? AND object_id = ?',
      [row.object_type, row.object_id]);
  }
}

async function rewriteCompanionHostObjectIds(db: DbPort, previous: string, current: string) {
  const rows = await db.query<{ object_id: string; object_type: string }>(
    "SELECT object_id, object_type FROM sync_object_state WHERE object_type IN ('setting', 'view_state')"
  );
  for (const row of rows) {
    const parts = row.object_id.split(':');
    if (parts.length < 5 || parts[3] !== previous || parts[0] === 'user_space') continue;
    parts[3] = current;
    if (parts[0] === 'device') parts[0] = 'host';
    const objectId = parts.join(':');
    await db.run('DELETE FROM sync_object_state WHERE object_type = ? AND object_id = ?', [row.object_type, objectId]);
    await db.run('UPDATE sync_object_state SET object_id = ?, sync_dirty = 1 WHERE object_type = ? AND object_id = ?',
      [objectId, row.object_type, row.object_id]);
  }
}

async function writeMeta(db: DbPort, key: string, value: string, now: string) {
  await db.run('INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now]);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
