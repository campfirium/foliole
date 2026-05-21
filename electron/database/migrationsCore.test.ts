import { describe, expect, it, vi } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { DatabaseMigrationTarget } from '../../lib/core/database/migrationTypes.js';

function createMigrationTarget(version: number): DatabaseMigrationTarget & { transactionSpy: ReturnType<typeof vi.fn> } {
  const transactionSpy = vi.fn();
  return {
    exec: vi.fn(),
    pragma: vi.fn((command: string) => {
      if (command === 'user_version') {
        return version;
      }
      return null;
    }),
    prepare: vi.fn(),
    transaction<T>(fn: () => T) {
      transactionSpy(fn);
      return fn;
    },
    transactionSpy
  };
}

describe('initializeDatabaseSchema', () => {
  it('does not open a schema transaction when the database version is current', () => {
    const sqlite = createMigrationTarget(DATABASE_SCHEMA_VERSION);

    initializeDatabaseSchema(sqlite);

    expect(sqlite.transactionSpy).not.toHaveBeenCalled();
    expect(sqlite.pragma).toHaveBeenCalledWith('user_version', { simple: true });
  });
});
