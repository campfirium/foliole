import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

class NodeSqliteReadonlyDatabase {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return this.database.prepare(sql);
  }

  close() {
    this.database.close();
  }
}

async function openBetterSqliteDatabase(filePath) {
  const module = await import('better-sqlite3');
  const Database = module.default;
  return new Database(filePath, { readonly: true, fileMustExist: true });
}

async function openNodeSqliteDatabase(filePath) {
  return new NodeSqliteReadonlyDatabase(new DatabaseSync(filePath, { readOnly: true }));
}

export async function openReadonlySqliteDatabase(filePath) {
  try {
    return await openBetterSqliteDatabase(filePath);
  } catch (betterSqliteError) {
    try {
      return await openNodeSqliteDatabase(filePath);
    } catch (nodeSqliteError) {
      const betterMessage = betterSqliteError instanceof Error ? betterSqliteError.message : String(betterSqliteError);
      const nodeMessage = nodeSqliteError instanceof Error ? nodeSqliteError.message : String(nodeSqliteError);
      throw new Error(`sqlite open failed: better-sqlite3=${betterMessage}; node:sqlite=${nodeMessage}`);
    }
  }
}

export function openReadonlySqliteDatabaseSync(filePath) {
  try {
    const Database = require('better-sqlite3');
    return new Database(filePath, { readonly: true, fileMustExist: true });
  } catch (betterSqliteError) {
    try {
      return new NodeSqliteReadonlyDatabase(new DatabaseSync(filePath, { readOnly: true }));
    } catch (nodeSqliteError) {
      const betterMessage = betterSqliteError instanceof Error ? betterSqliteError.message : String(betterSqliteError);
      const nodeMessage = nodeSqliteError instanceof Error ? nodeSqliteError.message : String(nodeSqliteError);
      throw new Error(`sqlite open failed: better-sqlite3=${betterMessage}; node:sqlite=${nodeMessage}`);
    }
  }
}
