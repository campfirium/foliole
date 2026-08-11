import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';

export type CompanionJournalMode = 'delete' | 'wal';

export interface CompanionDatabaseBootstrapRequest {
  allowCreate: boolean;
  beforeVersionCommit?: () => void | Promise<void>;
  expectedDeviceId?: string;
  expectedJournalMode?: CompanionJournalMode;
  now: string;
}

export interface CompanionDatabaseBootstrapResult {
  created: boolean;
  credentialResetPending: boolean;
  deviceId: string;
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
  const existingDeviceId = hasSchema ? await requireExistingDeviceIdentity(db) : null;
  if (!hasSchema && !request.expectedDeviceId) throw new CompanionDatabaseBlockedError('identity-missing');
  const journalMode = await restoreExpectedJournalMode(db, openedJournalMode, request.expectedJournalMode);
  await db.transaction(async (tx) => {
    if (!hasSchema) {
      await createCompanionDatabase(tx, COMPANION_DATABASE_VERSION, request.beforeVersionCommit);
      await tx.run('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)', [
        'device_id', request.expectedDeviceId!, request.now
      ]);
    }
    else {
      await migrateCompanionDatabase(tx, version, COMPANION_DATABASE_VERSION, request.beforeVersionCommit);
      if (request.expectedDeviceId && existingDeviceId !== request.expectedDeviceId) {
        await replaceCompanionDeviceProfile(tx, existingDeviceId!, request.expectedDeviceId, request.now);
      }
    }
  });
  const deviceId = request.expectedDeviceId ?? existingDeviceId!;
  const credentialResetPending = await readMeta(db, 'device_identity_reset_pending') === deviceId;
  return { created: !hasSchema, credentialResetPending, deviceId, journalMode, version: COMPANION_DATABASE_VERSION };
}

export async function acknowledgeCompanionDeviceProfileReset(db: DbPort, deviceId: string) {
  await db.run(
    "DELETE FROM companion_meta WHERE key = 'device_identity_reset_pending' AND value = ?",
    [deviceId]
  );
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

async function replaceCompanionDeviceProfile(db: DbPort, previousId: string, nextId: string, now: string) {
  await db.run(
    `INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES ('device_id', ?, ?)`,
    [nextId, now]
  );
  await db.run('DELETE FROM sync_group_local_state WHERE singleton_id = 1 AND local_device_id = ?', [previousId]);
  await db.run(
    `INSERT OR REPLACE INTO companion_meta (key, value, updated_at)
     VALUES ('device_identity_reset_pending', ?, ?)`,
    [nextId, now]
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
