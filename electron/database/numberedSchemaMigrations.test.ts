// @vitest-environment node

import { expect, it } from 'vitest';

import {
  applyNumberedSchemaMigrations,
  resolveNumberedSchemaMigrations
} from '../../lib/core/database/index.js';

it('requires numbered migrations for every schema version after v28', () => {
  expect(resolveNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [
      { version: 29, migrate: () => undefined },
      { version: 30, migrate: () => undefined }
    ],
    targetVersion: 30
  }).map((migration) => migration.version)).toEqual([29, 30]);

  expect(() => resolveNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [{ version: 30, migrate: () => undefined }],
    targetVersion: 30
  })).toThrow(/missing database schema migration for version 29/i);
});

it('rejects duplicate numbered schema migrations', () => {
  expect(() => resolveNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [
      { version: 29, migrate: () => undefined },
      { version: 29, migrate: () => undefined }
    ],
    targetVersion: 29
  })).toThrow(/duplicate database schema migration registered for version 29/i);
});

it('applies numbered schema migrations and advances user_version after each version', () => {
  const events: string[] = [];

  applyNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [
      { version: 29, migrate: () => events.push('migrate-29') },
      { version: 30, migrate: () => events.push('migrate-30') }
    ],
    setUserVersion: (version) => events.push(`version-${version}`),
    sqlite: {} as never,
    targetVersion: 30
  });

  expect(events).toEqual(['migrate-29', 'version-29', 'migrate-30', 'version-30']);
});
