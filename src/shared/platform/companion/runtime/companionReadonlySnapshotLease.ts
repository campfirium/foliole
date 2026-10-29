import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

/** Callers share one committed transaction, with independent cancellation and ports. */
export class CompanionReadonlySnapshotLease {
  private accepting = true;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly reader: DbPort, private readonly lifetime: AbortSignal) {}

  read<T>(execute: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> | undefined {
    if (!this.accepting) return undefined;
    const result = this.execute(execute, signal);
    this.pending.add(result);
    void result.then(() => this.pending.delete(result), () => this.pending.delete(result));
    return result;
  }

  async finish() {
    this.accepting = false;
    await Promise.allSettled(this.pending);
  }

  private async execute<T>(execute: (db: DbPort) => Promise<T>, signal?: AbortSignal) {
    let active = true;
    const queries = new Set<Promise<unknown>>();
    const check = () => {
      this.lifetime.throwIfAborted();
      signal?.throwIfAborted();
      if (!active) throw new Error('request_sync_snapshot_closed');
    };
    const db: DbPort = {
      query: async <Row extends DbRow>(sql: string, params?: DbParams) => {
        check();
        const result = this.reader.query<Row>(sql, params);
        queries.add(result);
        try { const rows = await result; check(); return rows; }
        finally { queries.delete(result); }
      },
      async run() { throw new Error('request_sync_snapshot_write_forbidden'); },
      async transaction(callback) {
        check();
        const result = await callback(db);
        check();
        return result;
      }
    };
    try { check(); const result = await execute(db); check(); return result; }
    finally { active = false; await Promise.allSettled(queries); }
  }
}
