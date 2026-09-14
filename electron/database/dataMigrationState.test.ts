// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import {
  readDataMigrationState,
  writeDataMigrationState
} from '../../lib/core/database/dataMigrationState.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

it.each(['fresh', 'schema-86'] as const)('creates database-owned data migration state for %s databases', (source) => {
  const sqlite = new Database(':memory:');
  if (source === 'schema-86') sqlite.pragma('user_version = 86');

  initializeDatabaseSchema(sqlite);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(readDataMigrationState(sqlite, 'migration-a')).toBeNull();
  writeDataMigrationState(sqlite, {
    migration_id: 'migration-a',
    run_id: 'run-a',
    status: 'running',
    updated_at: '2026-09-14T00:00:00.000Z'
  });
  writeDataMigrationState(sqlite, {
    migration_id: 'migration-a',
    run_id: 'run-a',
    status: 'completed',
    updated_at: '2026-09-14T00:01:00.000Z'
  });
  expect(readDataMigrationState(sqlite, 'migration-a')).toEqual({
    migration_id: 'migration-a',
    run_id: 'run-a',
    status: 'completed',
    updated_at: '2026-09-14T00:01:00.000Z'
  });
  sqlite.close();
});
