import type { DatabaseDriver, DatabaseExecuteResult, DatabaseRow, DatabaseStatement } from '../../lib/core/database/driver.js';

import type { SqliteDatabase } from './connection.js';

function toExecuteResult(result: { changes: number; lastInsertRowid: number | bigint }) : DatabaseExecuteResult {
  return {
    changes: result.changes,
    lastInsertRowId: result.lastInsertRowid
  };
}

export function createBetterSqlite3Driver(sqlite: SqliteDatabase): DatabaseDriver {
  const driver: DatabaseDriver = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      const driverStatement: DatabaseStatement = {
        sql,
        run(params = []) {
          return toExecuteResult(statement.run(...params));
        },
        get<T extends DatabaseRow = DatabaseRow>(params = []) {
          return statement.get(...params) as T | undefined;
        },
        all<T extends DatabaseRow = DatabaseRow>(params = []) {
          return statement.all(...params) as T[];
        }
      };
      return driverStatement;
    },
    execute(sql: string, params = []) {
      return toExecuteResult(sqlite.prepare(sql).run(...params));
    },
    queryOne<T extends DatabaseRow = DatabaseRow>(sql: string, params = []) {
      return sqlite.prepare(sql).get(...params) as T | undefined;
    },
    queryAll<T extends DatabaseRow = DatabaseRow>(sql: string, params = []) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    transaction<T>(execute: (driver: DatabaseDriver) => T): T {
      const wrapped = sqlite.transaction(() => execute(driver));
      return wrapped();
    }
  };

  return driver;
}
