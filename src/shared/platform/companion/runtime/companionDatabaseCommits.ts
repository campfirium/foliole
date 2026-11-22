import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { markFolderBackupChangedSince } from '../folderBackup/companionFolderBackupProgress';

/** Observes successful owner writes; backup bookkeeping explicitly opts out. */
export class CompanionDatabaseCommits {
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async write<T>(db: DbPort, execute: (db: DbPort) => Promise<T>, notify: boolean) {
    if (!notify) return execute(db);
    let changed = false;
    const result = await db.transaction(async tx => {
      const [before] = await tx.query<{ changes: number }>('SELECT total_changes() AS changes');
      const value = await execute(tx);
      // Whether the write changed a row and the stale backup mark are one statement.
      changed = await markFolderBackupChangedSince(tx, Number(before!.changes));
      return value;
    });
    if (changed) {
      for (const listener of this.listeners) {
        try { listener(); } catch { /* Observers never change the original write result. */ }
      }
    }
    return result;
  }
}
