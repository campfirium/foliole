import { DatabaseSync } from 'node:sqlite';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

export function openReadwiseImportTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) sqlite.exec(sql);
  sqlite.exec("INSERT INTO settings(key, value, updated_at) VALUES ('host_name', 'readwise-test', '2026-01-01')");
  let depth = 0;
  const adapter = {
    prepare: sqlite.prepare.bind(sqlite),
    transaction: <T>(run: () => T) => () => {
      const name = `test_transaction_${depth++}`;
      sqlite.exec(`SAVEPOINT ${name}`);
      try {
        return run();
      } catch (error) {
        sqlite.exec(`ROLLBACK TO ${name}`);
        throw error;
      } finally {
        sqlite.exec(`RELEASE ${name}`);
        depth--;
      }
    }
  };
  const driver = createBetterSqlite3Driver(adapter as unknown as Parameters<typeof createBetterSqlite3Driver>[0]);
  bindParentOrderWriter(driver, { deviceAnchor: 'readwise-test', libraryPath: ':memory:' });
  return { driver, sqlite };
}
