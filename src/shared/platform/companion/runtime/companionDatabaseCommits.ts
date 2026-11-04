import type { DbPort } from '../../../../../lib/core/sync/dbPort';

/** Observes successful owner writes; backup bookkeeping explicitly opts out. */
export class CompanionDatabaseCommits {
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async write<T>(db: DbPort, execute: (db: DbPort) => Promise<T>, notify: boolean) {
    if (!notify || !this.listeners.size) return execute(db);
    const before = await db.query('SELECT total_changes() AS changes');
    const result = await execute(db);
    const after = await db.query('SELECT total_changes() AS changes');
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      for (const listener of this.listeners) {
        try { listener(); } catch { /* Observers never change the original write result. */ }
      }
    }
    return result;
  }
}
