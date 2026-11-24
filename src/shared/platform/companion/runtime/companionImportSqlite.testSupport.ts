import { DatabaseSync } from 'node:sqlite';

import { createCompanionDatabase } from '../../../../../lib/core/database/companionDatabaseMigrationExecutor';
import { INBOX_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { bindParentOrderWriterWithDbPort } from '../../../../../lib/core/sync/parentOrderWriter';
import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';

export async function openCompanionImportTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  let depth = 0;
  const db: DbPort = {
    connectionIdentity: sqlite,
    async query<T extends DbRow>(sql: string, values: DbParams = []) {
      return sqlite.prepare(sql).all(...values) as T[];
    },
    async run(sql, values = []) {
      const result = sqlite.prepare(sql).run(...values);
      return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
    },
    async transaction(task) {
      const name = `companion_import_${depth++}`;
      sqlite.exec(`SAVEPOINT ${name}`);
      try {
        return await task(db);
      } catch (error) {
        sqlite.exec(`ROLLBACK TO ${name}`);
        throw error;
      } finally {
        sqlite.exec(`RELEASE ${name}`);
        depth--;
      }
    }
  };
  try {
    await createCompanionDatabase(db, COMPANION_DATABASE_VERSION);
    await db.run("INSERT INTO companion_meta (key,value,updated_at) VALUES ('host_name','test','2026-01-01')");
    await db.run("INSERT INTO nodes (id,kind,title,created_at,updated_at) VALUES (?,'folder','Inbox','2026-01-01','2026-01-01')",
      [INBOX_NODE_ID]);
    await bindParentOrderWriterWithDbPort(db, { deviceAnchor: 'companion-test', libraryPath: ':memory:' });
    const withDb = <T>(task: (port: DbPort) => Promise<T>) => task(db);
    return { db, close: () => sqlite.close(),
      owner: { databasePath: ':memory:', read: withDb, runWriter: withDb } };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
