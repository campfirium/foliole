export type DbValue = string | number | bigint | Uint8Array | null;

export type DbParams = readonly DbValue[];

export interface DbRow {
  [column: string]: unknown;
}

export interface DbRunResult {
  changes: number;
  lastInsertRowId: number | bigint | null;
}

export type DbErrorCode = 'SQLITE_BUSY' | 'SQLITE_LOCKED' | 'SQLITE_CONSTRAINT' | 'SQLITE_UNKNOWN';

export class DbPortError extends Error {
  readonly code: DbErrorCode;
  override readonly cause?: unknown;

  constructor(message: string, code: DbErrorCode = 'SQLITE_UNKNOWN', cause?: unknown) {
    super(message);
    this.name = 'DbPortError';
    this.code = code;
    this.cause = cause;
  }
}

export interface DbPort {
  run(sql: string, params?: DbParams): Promise<DbRunResult>;
  query<T extends DbRow = DbRow>(sql: string, params?: DbParams): Promise<T[]>;
  transaction<T>(execute: (tx: DbPort) => Promise<T>): Promise<T>;
}

export interface DbPortFactory {
  open(name: string): Promise<DbPort>;
  close(port: DbPort): Promise<void>;
  path(name: string): string;
}
