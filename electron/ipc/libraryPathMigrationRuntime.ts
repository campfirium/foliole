import fs from 'node:fs';

let libraryHomeMigrationDepth = 0;
const movedDatabasePaths = new Set<string>();

export function beginLibraryHomeMigration() {
  libraryHomeMigrationDepth += 1;
}

export function endLibraryHomeMigration() {
  libraryHomeMigrationDepth = Math.max(0, libraryHomeMigrationDepth - 1);
}

export function markLibraryHomeDatabaseMoved(databasePath: string) {
  movedDatabasePaths.add(databasePath);
}

export function allowLibraryHomeDatabaseRestore(databasePath: string) {
  movedDatabasePaths.delete(databasePath);
}

export function assertLibraryHomeMigrationCanOpenDatabase(databasePath?: string) {
  if (libraryHomeMigrationDepth > 0) {
    throw new Error('library_home_migration_in_progress');
  }
  if (databasePath && movedDatabasePaths.has(databasePath)) {
    if (fs.existsSync(databasePath)) {
      movedDatabasePaths.delete(databasePath);
      return;
    }
    throw new Error(`library_home_database_moved: ${databasePath}`);
  }
}
