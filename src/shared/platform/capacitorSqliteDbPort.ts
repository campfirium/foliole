import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import { DbPortError, type DbErrorCode, type DbParams, type DbPort, type DbRow, type DbRunResult, type DbValue } from '../../../lib/core/sync/dbPort.js';

interface CapacitorChanges {
  changes?: {
    changes?: number;
    lastId?: number;
  };
}

type CapacitorRow = Record<string, unknown>;

interface BufferJson {
  type: 'Buffer';
  data: number[];
}

export function createCapacitorSqliteDbPort(connection: SQLiteDBConnection): DbPort {
  const port: DbPort = {
    async run(sql, params = []) {
      try {
        const result = await runStatement(connection, sql, params);
        return normalizeRunResult(result);
      } catch (error) {
        throw normalizeSqliteError(error, sql);
      }
    },
    async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      try {
        const result = await connection.query(sql, normalizeParams(params));
        return (result.values ?? []).map(normalizeRow) as T[];
      } catch (error) {
        throw normalizeSqliteError(error);
      }
    },
    async transaction<T>(execute: (tx: DbPort) => Promise<T>) {
      await connection.beginTransaction();
      try {
        const result = await execute(port);
        await connection.commitTransaction();
        return result;
      } catch (error) {
        await connection.rollbackTransaction();
        throw normalizeSqliteError(error);
      }
    }
  };
  return port;
}

async function runStatement(connection: SQLiteDBConnection, sql: string, params: DbParams) {
  if (params.length === 0 && shouldExecuteWithoutImplicitTransaction(sql)) {
    return connection.execute(sql, false);
  }
  return connection.run(sql, normalizeParams(params), false);
}

function shouldExecuteWithoutImplicitTransaction(sql: string) {
  const statement = sql.trim().toUpperCase();
  return statement.startsWith('ATTACH ') || statement.startsWith('DETACH ');
}

function normalizeParams(params: DbParams) {
  return params.map(normalizeValue);
}

function normalizeValue(value: DbValue): DbValue | BufferJson {
  if (value instanceof Uint8Array) {
    return {
      type: 'Buffer',
      data: Array.from(value)
    };
  }
  return value;
}

function normalizeRunResult(result: CapacitorChanges): DbRunResult {
  return {
    changes: result.changes?.changes ?? 0,
    lastInsertRowId: result.changes?.lastId ?? null
  };
}

function normalizeRow(row: CapacitorRow): DbRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeColumnValue(value)]));
}

function normalizeColumnValue(value: unknown) {
  if (isByteArray(value)) return new Uint8Array(value);
  return value;
}

function isByteArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255);
}

function normalizeSqliteError(error: unknown, sql?: string) {
  if (error instanceof DbPortError) return error;
  if (hasSqliteCode(error)) {
    return new DbPortError(withSqlContext(error.message, sql), normalizeSqliteCode(error.code), error);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new DbPortError(withSqlContext(message, sql), inferSqliteCode(message), error);
}

function withSqlContext(message: string, sql?: string) {
  if (!sql) return message;
  return `${message} while running: ${summarizeSql(sql)}`;
}

function summarizeSql(sql: string) {
  return sql.trim().replace(/\s+/g, ' ').slice(0, 240);
}

function hasSqliteCode(error: unknown): error is { code: string; message: string } {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}

function normalizeSqliteCode(code: string): DbErrorCode {
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || code === 'SQLITE_CONSTRAINT') return code;
  return inferSqliteCode(code);
}

function inferSqliteCode(message: string): DbErrorCode {
  const normalized = message.toLowerCase();
  if (normalized.includes('database is locked') || normalized.includes('code 5') || normalized.includes('sqlite_busy')) {
    return 'SQLITE_BUSY';
  }
  if (normalized.includes('database table is locked') || normalized.includes('sqlite_locked')) {
    return 'SQLITE_LOCKED';
  }
  if (normalized.includes('constraint') || normalized.includes('sqlite_constraint')) {
    return 'SQLITE_CONSTRAINT';
  }
  return 'SQLITE_UNKNOWN';
}
