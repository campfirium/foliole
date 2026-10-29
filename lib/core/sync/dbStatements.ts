import type { DbParams, DbPort } from './dbPort.js';

export type DbStatement = { sql: string; params?: DbParams };
export interface DbBatchPort extends DbPort {
  /** Runs bound statements in the caller's transaction; returns no per-statement changes. */
  batch(statements: readonly DbStatement[]): Promise<void>;
}

export function supportsDbBatch(db: DbPort): db is DbBatchPort {
  return 'batch' in db && typeof db.batch === 'function';
}

// Hosts without batch transport retain their ordinary sequential execution.
export async function writeDbStatements(db: DbPort, statements: readonly DbStatement[]) {
  if (!statements.length) return;
  if (supportsDbBatch(db)) return db.batch(statements);
  for (const statement of statements) await db.run(statement.sql, statement.params);
}
