import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import type { DbPort, DbRow } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function desktopMigrationTarget(sqlite: DatabaseSync): DatabaseMigrationTarget {
  return {
    exec: sql => sqlite.exec(sql),
    function: sqlite.function.bind(sqlite),
    pragma: (command, options) => {
      const sql = `PRAGMA ${command}`;
      if (!options?.simple) return sqlite.exec(sql);
      return Object.values(sqlite.prepare(sql).get() ?? {})[0];
    },
    prepare: sql => {
      const statement = sqlite.prepare(sql);
      return {
        all: (...params) => statement.all(...params as SQLInputValue[]),
        run: (...params) => statement.run(...params as SQLInputValue[])
      };
    },
    transaction: execute => () => {
      sqlite.exec('BEGIN');
      try {
        const result = execute();
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

export function companionPort(sqlite: DatabaseSync): DbPort {
  const port: DbPort = {
    async query<T extends DbRow>(sql: string, params = []) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async run(sql, params = []) {
      const { changes, lastInsertRowid } = sqlite.prepare(sql).run(...params);
      return { changes: Number(changes), lastInsertRowId: Number(lastInsertRowid) };
    },
    async transaction(execute) {
      sqlite.exec('BEGIN');
      try {
        const result = await execute(port);
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
