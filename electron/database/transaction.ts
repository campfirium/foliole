import type { SqliteDatabase } from './connection.js';

export function withTransaction<T>(sqlite: SqliteDatabase, execute: () => T): T {
  return sqlite.transaction(execute)();
}
