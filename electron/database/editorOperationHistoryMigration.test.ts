// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { installHistoricalDesktopSchema } from './historicalMigration.test-support.js';

it('adds local durable editor history in schema v96', () => {
  const sqlite = new Database(':memory:');
  installHistoricalDesktopSchema(sqlite, 95);
  initializeDatabaseSchema(sqlite);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(sqlite.prepare(
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'editor_operation_history'"
  ).pluck().get()).toBe(1);
  sqlite.close();
});
