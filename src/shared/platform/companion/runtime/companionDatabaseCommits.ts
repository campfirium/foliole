import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { markFolderBackupChangedSince } from '../folderBackup/companionFolderBackupProgress';

import type { CompanionWriteKind } from './capacitorCompanionDatabaseOwner';

/** Observes successful owner writes; backup bookkeeping explicitly opts out. */
export class CompanionDatabaseCommits {
  private usageChanges = 0;
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  resetUsageChanges() { this.usageChanges = 0; }

  get usageChangeCount() { return this.usageChanges; }

  async write<T>(db: DbPort, execute: (db: DbPort) => Promise<T>, kind: CompanionWriteKind) {
    if (kind === 'usage') return this.writeUsage(db, execute);
    if (kind !== 'business') return execute(db);
    let changed = false;
    const result = await db.transaction(async tx => {
      const before = await totalChanges(tx);
      const value = await execute(tx);
      // Whether the write changed a row and the stale backup mark are one statement.
      changed = await markFolderBackupChangedSince(tx, before);
      return value;
    });
    if (changed) {
      for (const listener of this.listeners) {
        try { listener(); } catch { /* Observers never change the original write result. */ }
      }
    }
    return result;
  }

  private async writeUsage<T>(db: DbPort, execute: (db: DbPort) => Promise<T>) {
    // The owner runs these statistics writes alone on its connection.
    // Subtract only their changes and keep detecting every other writer and connection.
    const before = await totalChanges(db);
    try { return await execute(db); }
    finally { this.usageChanges += await totalChanges(db) - before; }
  }
}

async function totalChanges(db: DbPort) {
  const [row] = await db.query<{ changes: number }>('SELECT total_changes() AS changes');
  return Number(row!.changes);
}
