export interface DatabaseMigrationTarget {
  exec(sql: string): void;
  function?(name: string, options: { deterministic: boolean }, callback: (value: unknown) => string | null): unknown;
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
