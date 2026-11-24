import { DatabaseSync } from 'node:sqlite';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { registerStoredImportLocatorKey } from '../../lib/core/database/storedImportLocatorSchema.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import type { SqliteDatabase } from './connection.js';

/** Runs desktop SQL against real SQLite in ordinary Node, without loading the Electron ABI. */
export function openNodeSqliteFixture() {
  const database = new DatabaseSync(':memory:');
  registerStoredImportLocatorKey(database);
  database.exec("ATTACH DATABASE ':memory:' AS search");
  for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) database.exec(sql);
  database.exec(`INSERT INTO settings (key, value, updated_at)
    VALUES ('host_name', '"test-host"', '2026-10-08T00:00:00.000Z')`);
  let nextSavepoint = 0;
  const sqlite = {
    name: ':memory:',
    readonly: false,
    get inTransaction() { return database.isTransaction; },
    prepare: database.prepare.bind(database),
    exec: database.exec.bind(database),
    transaction<T>(execute: () => T) {
      function run(immediate: boolean) {
        const nested = database.isTransaction;
        const savepoint = `fixture_${++nextSavepoint}`;
        database.exec(nested ? `SAVEPOINT ${savepoint}` : immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
        try {
          const result = execute();
          database.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
          return result;
        } catch (error) {
          database.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK');
          throw error;
        }
      }
      return Object.assign(() => run(false), { immediate: () => run(true) });
    },
    close: database.close.bind(database)
  };
  const compatibleSqlite = sqlite as unknown as SqliteDatabase;
  const driver = createBetterSqlite3Driver(compatibleSqlite);
  bindParentOrderWriter(driver, { deviceAnchor: 'test', libraryPath: '/test' });
  return { driver, sqlite, port: createBetterSqliteDbPort(compatibleSqlite) };
}
