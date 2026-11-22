import { prepareCompanionRestoreCandidate } from '../../../../../lib/core/database/companionRestoreCandidate';
import { readRestoreCarriedMeta } from '../../../../../lib/core/database/companionRestoreIdentity';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type {
  CompanionBackupRestorePort,
  CompanionBackupRestoreSource,
  CompanionBackupRestoreStaged
} from '../../../../../lib/platform/companionBackupRestoreContract';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

export interface CompanionBackupRestoreContext {
  owner: CapacitorCompanionDatabaseOwner;
  /** Opens the staged copy by its SQLite name, runs the task, and closes it again. */
  openCandidate<T>(database: string, task: (db: DbPort) => Promise<T>): Promise<T>;
  port: CompanionBackupRestorePort;
  now?: () => string;
}

async function readThisDevice(db: DbPort) {
  const [member] = await db.query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'sync_group_local_state'");
  if (member && (await db.query('SELECT 1 AS present FROM sync_group_local_state LIMIT 1')).length) {
    throw new Error('restore_sync_group_active');
  }
  const rows = await db.query<{ key: string; value: string }>(
    "SELECT key, value FROM companion_meta WHERE key IN ('device_id', 'host_name')");
  const meta = Object.fromEntries(rows.map(row => [row.key, row.value]));
  if (!meta.device_id || !meta.host_name) throw new Error('restore_identity_missing');
  return { deviceId: meta.device_id, hostName: meta.host_name, carriedMeta: await readRestoreCarriedMeta(db) };
}

/**
 * Copy a chosen backup into staging and turn it into a candidate library for this device.
 * Only the staged copy is written; any failure discards it and leaves the library as it was.
 */
export async function stageCompanionBackupRestore(
  context: CompanionBackupRestoreContext,
  source: CompanionBackupRestoreSource
): Promise<CompanionBackupRestoreStaged> {
  const device = await context.owner.read(readThisDevice);
  const staged = await context.port.stage({ source });
  if (staged.cancelled) return { cancelled: true };
  try {
    const candidate = await context.openCandidate(staged.database, db => prepareCompanionRestoreCandidate(db, {
      ...device, now: context.now?.() ?? new Date().toISOString(), stagedStorageKeys: staged.storageKeys
    }));
    return { cancelled: false, summary: { ...candidate, sourceLabel: staged.sourceLabel,
      skippedFiles: staged.skippedFiles, damagedFiles: staged.damagedFiles } };
  } catch (error) {
    await context.port.discard().catch(() => undefined);
    throw error;
  }
}

export interface CompanionBackupRestoreCommitContext extends Pick<CompanionBackupRestoreContext, 'owner' | 'port'> {
  /** Waits until no folder backup round, manual or automatic, still reads the current library. */
  settleBackups(): Promise<void>;
  /** Serializes the swap with attachment file maintenance. */
  exclusive<T>(task: () => Promise<T>): Promise<T>;
  closeDatabase(): Promise<void>;
  /** Drops the backup state the native backup host still holds for the replaced library. */
  forgetBackupFolder(): Promise<unknown>;
  reload(): void;
}

/**
 * Close every writer of the current library, then swap libraries natively. A failure after
 * the close leaves the database closed, so the caller offers to reopen the app.
 */
async function replaceCompanionLibrary(context: CompanionBackupRestoreCommitContext, swap: () => Promise<void>) {
  await context.owner.read(readThisDevice);
  await context.settleBackups();
  await context.exclusive(async () => {
    await context.closeDatabase();
    await swap();
  });
  await context.forgetBackupFolder().catch(() => undefined);
  context.reload();
}

/** Swap in the staged candidate; the current library becomes the previous one. */
export function commitCompanionBackupRestore(context: CompanionBackupRestoreCommitContext) {
  return replaceCompanionLibrary(context, () => context.port.commit());
}

/** Put the previous library back; the current library becomes the previous one. */
export function revertCompanionBackupRestore(context: CompanionBackupRestoreCommitContext) {
  return replaceCompanionLibrary(context, () => context.port.revert());
}

export function discardCompanionBackupRestore(context: Pick<CompanionBackupRestoreContext, 'port'>) {
  return context.port.discard();
}
