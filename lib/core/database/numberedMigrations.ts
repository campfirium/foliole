import type { DatabaseMigrationTarget } from './migrationTypes.js';

export const NUMBERED_MIGRATION_BASE_VERSION = 28;

export interface NumberedSchemaMigration {
  migrate: (sqlite: DatabaseMigrationTarget) => void;
  version: number;
}

export const NUMBERED_SCHEMA_MIGRATIONS: NumberedSchemaMigration[] = [];

export function resolveNumberedSchemaMigrations(args: {
  currentVersion: number;
  legacyMessage: string;
  migrations?: NumberedSchemaMigration[];
  targetVersion: number;
}): NumberedSchemaMigration[] {
  if (args.currentVersion < NUMBERED_MIGRATION_BASE_VERSION) {
    throw new Error(args.legacyMessage);
  }
  if (args.currentVersion > args.targetVersion) {
    throw new Error(`database schema version ${args.currentVersion} is newer than supported`);
  }

  const migrationsByVersion = indexMigrations(args.migrations ?? NUMBERED_SCHEMA_MIGRATIONS);
  const pendingMigrations: NumberedSchemaMigration[] = [];
  for (let version = args.currentVersion + 1; version <= args.targetVersion; version += 1) {
    const migration = migrationsByVersion.get(version);
    if (!migration) {
      throw new Error(`missing database schema migration for version ${version}`);
    }
    pendingMigrations.push(migration);
  }
  return pendingMigrations;
}

export function applyNumberedSchemaMigrations(args: {
  currentVersion: number;
  legacyMessage: string;
  migrations?: NumberedSchemaMigration[];
  setUserVersion: (version: number) => void;
  sqlite: DatabaseMigrationTarget;
  targetVersion: number;
}) {
  const migrations = resolveNumberedSchemaMigrations(args);
  for (const migration of migrations) {
    migration.migrate(args.sqlite);
    args.setUserVersion(migration.version);
  }
}

function indexMigrations(migrations: NumberedSchemaMigration[]) {
  const migrationsByVersion = new Map<number, NumberedSchemaMigration>();
  for (const migration of migrations) {
    if (migrationsByVersion.has(migration.version)) {
      throw new Error(`duplicate database schema migration registered for version ${migration.version}`);
    }
    migrationsByVersion.set(migration.version, migration);
  }
  return migrationsByVersion;
}
