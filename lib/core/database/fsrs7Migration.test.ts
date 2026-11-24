// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { expect, it } from 'vitest';

import type { DbPort, DbRow } from '../sync/dbPort.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

const due = '2026-03-10T12:00:00.000Z';
const invalidAt = '2026-02-30T12:00:00Z';

function desktopMigrationTarget(sqlite: DatabaseSync): DatabaseMigrationTarget {
  return {
    exec: sql => sqlite.exec(sql),
    pragma: (command, options) => {
      const sql = `PRAGMA ${command}`;
      if (!options?.simple) return sqlite.exec(sql);
      return Object.values(sqlite.prepare(sql).get() ?? {})[0];
    },
    prepare: sql => {
      const statement = sqlite.prepare(sql);
      return {
        all: (...params) => statement.all(...params as SQLInputValue[]),
        run: (...params) => statement.run(...params as SQLInputValue[])
      };
    },
    transaction: execute => () => {
      sqlite.exec('BEGIN');
      try {
        const result = execute();
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function companionPort(sqlite: DatabaseSync): DbPort {
  const port: DbPort = {
    async query<T extends DbRow>(sql: string, params = []) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async run(sql, params = []) {
      const { changes, lastInsertRowid } = sqlite.prepare(sql).run(...params);
      return { changes: Number(changes), lastInsertRowId: Number(lastInsertRowid) };
    },
    async transaction(execute) {
      sqlite.exec('BEGIN');
      try {
        const result = await execute(port);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return port;
}

function seedHistory(sqlite: DatabaseSync, version: number, reviewedAt: string) {
  sqlite.exec(`DROP TRIGGER daily_flow_node_review_update;
    ALTER TABLE node_review DROP COLUMN stability_fast;
    PRAGMA user_version = ${version};
    INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES ('a-valid-card', 'item', 'First card', '${due}', '${due}'),
             ('z-legacy-card', 'item', 'Second card', '${due}', '${due}');
    INSERT INTO node_review (node_id, due, stability, reps)
      VALUES ('a-valid-card', '${due}', 100, 1), ('z-legacy-card', '${due}', 200, 1);
    INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at)
      VALUES ('valid', 'valid-review', 'host', 'a-valid-card', 3, 'fsrs-6', '2026-02-28T12:00:00Z');`);
  sqlite.prepare(`INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at)
    VALUES ('legacy', 'legacy-review', 'host', 'z-legacy-card', 3, 'fsrs-6', ?)`).run(reviewedAt);
}

it.each(['desktop', 'companion'] as const)(
  'identifies a legacy review that blocks the %s upgrade and rolls back, while valid history migrates',
  async host => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const desktop = desktopMigrationTarget(sqlite);
      const companion = companionPort(sqlite);
      const version = host === 'desktop' ? 183 : 112;
      const target = host === 'desktop' ? DATABASE_SCHEMA_VERSION : 113;
      const upgrade = async () => {
        if (host === 'desktop') initializeDatabaseSchema(desktop);
        else await companion.transaction(tx => migrateCompanionDatabase(tx, version, target));
      };
      if (host === 'desktop') initializeDatabaseSchema(desktop);
      else await createCompanionDatabase(companion, target);
      const facts = () => sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
      const cards = () => sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all();
      const schemaVersion = () => sqlite.prepare('PRAGMA user_version').get()?.user_version;
      seedHistory(sqlite, version, invalidAt);
      const oldFacts = facts(), oldCards = cards();

      await expect(upgrade()).rejects.toThrow(
        /FSRS-7.*invalid_review_timestamp.*node_id="z-legacy-card".*op_id="legacy-review"/u
      );
      expect(schemaVersion()).toBe(version);
      expect(facts()).toEqual(oldFacts);
      expect(cards()).toEqual(oldCards);

      // In this isolated fixture, supplying a verified timestamp lets the same upgrade resume.
      sqlite.prepare("UPDATE review_log SET reviewed_at = ? WHERE op_id = 'legacy-review'").run('2026-03-02T12:00:00Z');
      const repairedFacts = facts();
      await upgrade();
      expect(schemaVersion()).toBe(target);
      expect(facts()).toEqual(repairedFacts);
      expect(cards()).toEqual([
        expect.objectContaining({ node_id: 'a-valid-card', due, reps: 1, stability_fast: expect.any(Number) }),
        expect.objectContaining({ node_id: 'z-legacy-card', due, reps: 1, stability_fast: expect.any(Number) })
      ]);
    } finally {
      sqlite.close();
    }
  }
);
