import type { DatabaseSync } from 'node:sqlite';

import type {
  DatabaseBindParams, DatabaseDriver, DatabaseRow
} from '../../lib/core/database/driver.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';

export function nodeSqliteTestDriver(sqlite: DatabaseSync): DatabaseDriver {
  const driver: DatabaseDriver = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        sql,
        run(params: DatabaseBindParams = []) {
          const result = statement.run(...params);
          return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
        },
        get<T extends DatabaseRow>(params: DatabaseBindParams = []) {
          return statement.get(...params) as T | undefined;
        },
        all<T extends DatabaseRow>(params: DatabaseBindParams = []) {
          return statement.all(...params) as T[];
        }
      };
    },
    execute: (sql, params) => driver.prepare(sql).run(params),
    queryOne: (sql, params) => driver.prepare(sql).get(params),
    queryAll: (sql, params) => driver.prepare(sql).all(params),
    transaction(run) {
      sqlite.exec('BEGIN');
      try {
        const result = run(driver);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return driver;
}

export function nodeSqliteTestPort(sqlite: DatabaseSync): DbPort {
  const driver = nodeSqliteTestDriver(sqlite);
  const port: DbPort = {
    run: async (sql, params) => driver.execute(sql, params),
    query: async (sql, params) => driver.queryAll(sql, params),
    async transaction(run) {
      if (sqlite.isTransaction) return run(port);
      sqlite.exec('BEGIN');
      try {
        const result = await run(port);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return port;
}
