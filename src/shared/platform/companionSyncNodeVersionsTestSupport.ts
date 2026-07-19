import Database from 'better-sqlite3';

export function createFakeCapacitorConnection(database: Database.Database) {
  return {
    beginTransaction: async () => {
      database.exec('BEGIN');
    },
    commitTransaction: async () => {
      database.exec('COMMIT');
    },
    close: async () => undefined,
    execute: async (sql: string) => {
      database.exec(sql);
      const row = database.prepare('SELECT changes() AS count').get() as { count: number };
      return { changes: { changes: row.count } };
    },
    isDBOpen: async () => ({ result: false }),
    open: async () => undefined,
    query: async (sql: string, params: unknown[] = []) => ({
      values: database.prepare(sql).all(...decodeParams(params))
    }),
    rollbackTransaction: async () => {
      database.exec('ROLLBACK');
    },
    run: async (sql: string, params: unknown[] = []) => {
      const info = database.prepare(sql).run(...decodeParams(params));
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    }
  };
}

function decodeParams(params: unknown[]) {
  return params.map((param) => {
    if (isBufferJson(param)) return Uint8Array.from(param.data);
    return param;
  });
}

function isBufferJson(value: unknown): value is { data: number[]; type: 'Buffer' } {
  return value !== null && typeof value === 'object' && 'type' in value && 'data' in value;
}
