export interface DatabaseMigrationTarget {
  exec(sql: string): void;
  pragma(command: string, options?: { simple?: boolean }): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  transaction<T>(fn: () => T): () => T;
}

export interface DatabaseConnectionLike<TSqlite extends DatabaseMigrationTarget = DatabaseMigrationTarget> {
  sqlite: TSqlite;
}
