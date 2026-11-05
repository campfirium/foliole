import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { markFolderBackupChanged } from '../folderBackup/companionFolderBackupProgress';

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
      const before = await tx.query('SELECT total_changes() AS changes');
      const value = await execute(tx);
      const after = await tx.query('SELECT total_changes() AS changes');
      changed = JSON.stringify(before) !== JSON.stringify(after);
      if (changed) await markFolderBackupChanged(tx);
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
