import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function readUserVersion(sqlite: DatabaseMigrationTarget): number {
  const value = sqlite.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function setUserVersion(sqlite: DatabaseMigrationTarget, version: number) {
  sqlite.pragma(`user_version = ${version}`);
}
