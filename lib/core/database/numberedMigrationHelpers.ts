import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function tableExists(sqlite: DatabaseMigrationTarget, tableName: string) {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(tableName)[0] as { name?: string } | undefined;
  return row?.name === tableName;
}

export function columnExists(sqlite: DatabaseMigrationTarget, tableName: string, columnName: string) {
  if (!tableExists(sqlite, tableName)) return false;
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

export function addColumnIfMissing(
  sqlite: DatabaseMigrationTarget,
  tableName: string,
  columnName: string,
  columnSql: string
) {
  if (!tableExists(sqlite, tableName)) return;
  if (columnExists(sqlite, tableName, columnName)) return;
  sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
}

export function execOptionalIndex(sqlite: DatabaseMigrationTarget, statement: string) {
  try {
    sqlite.exec(statement);
  } catch (error) {
    if (error instanceof Error && /no such (table|column)/i.test(error.message)) {
      return;
    }
    throw error;
  }
}
