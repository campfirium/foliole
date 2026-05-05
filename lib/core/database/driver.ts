export type DatabaseBindValue = string | number | bigint | Uint8Array | null;

export type DatabaseBindParams = readonly DatabaseBindValue[];

export interface DatabaseRow {
  [column: string]: unknown;
}

export interface DatabaseExecuteResult {
  changes: number;
  lastInsertRowId: number | bigint | null;
}

export interface DatabaseStatement {
  readonly sql: string;
  run(params?: DatabaseBindParams): DatabaseExecuteResult;
  get<T extends DatabaseRow = DatabaseRow>(params?: DatabaseBindParams): T | undefined;
  all<T extends DatabaseRow = DatabaseRow>(params?: DatabaseBindParams): T[];
}

export interface DatabaseDriver {
  prepare(sql: string): DatabaseStatement;
  execute(sql: string, params?: DatabaseBindParams): DatabaseExecuteResult;
  queryOne<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T | undefined;
  queryAll<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T[];
  transaction<T>(execute: (driver: DatabaseDriver) => T): T;
}
