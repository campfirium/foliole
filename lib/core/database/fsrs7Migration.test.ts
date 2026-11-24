// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { expect, it } from 'vitest';

import { saveIosReviewWithDb } from '../../../src/shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites.js';
import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';
import { applyFramedFactSources, type FramedFactSource } from '../sync/framedSyncFactApply.js';
import { projectFramedSyncReview } from '../sync/framedSyncRelationReviewFact.js';
import { identityReviewRowSchema } from '../sync/syncFactRowSchemas.js';
import { applyReviewLogRecordsWithDbPort } from '../sync/syncReviewLogApply.js';

import { bootstrapCompanionDatabase } from './companionDatabaseLifecycle.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

const due = '2026-03-10T12:00:00.000Z';
const legacyAt = '2026-02-30T12:00:00Z';
const unparseableAt = '2026-02-32T12:00:00Z';
const validAt = '2026-03-02T12:00:00Z';
const hosts = ['desktop', 'companion'] as const;
const bootstrapRequest = { now: due, expectedHostName: 'host', allowCreate: true };

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

async function withReviewHistory(host: typeof hosts[number], reviewedAt: string, run: (fixture: {
  sqlite: DatabaseSync;
  open: (allowCreate: boolean) => Promise<void>;
  version: number;
  target: number;
}) => Promise<void>) {
  // A SQLite temporary file uses the rollback journal expected by companion bootstrap.
  const sqlite = new DatabaseSync('');
  try {
    const desktop = desktopMigrationTarget(sqlite);
    const companion = companionPort(sqlite);
    const version = host === 'desktop' ? 183 : 112;
    const target = host === 'desktop' ? DATABASE_SCHEMA_VERSION : COMPANION_DATABASE_VERSION;
    const open = async (allowCreate: boolean) => {
      if (host === 'desktop') initializeDatabaseSchema(desktop);
      else await bootstrapCompanionDatabase(companion, { ...bootstrapRequest, allowCreate });
    };
    await open(true);
    seedHistory(sqlite, version, reviewedAt);
    await run({ sqlite, open, version, target });
  } finally {
    sqlite.close();
  }
}

const readFacts = (sqlite: DatabaseSync) => sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
const readCards = (sqlite: DatabaseSync) => sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all();
const readSchemaVersion = (sqlite: DatabaseSync) => sqlite.prepare('PRAGMA user_version').get()?.user_version;

it.each(hosts)('identifies an unparseable legacy review on %s startup and rolls back', host =>
  withReviewHistory(host, unparseableAt, async ({ sqlite, open, version }) => {
    const oldFacts = readFacts(sqlite);
    const oldCards = readCards(sqlite);

    const upgrade = open(false);
    await expect(upgrade).rejects.toThrow(
      /FSRS-7.*invalid_review_timestamp.*node_id="z-legacy-card".*op_id="legacy-review"/u
    );
    await expect(upgrade).rejects.toThrow(/Keep the original library and its backups\. Contact Foliole support/u);
    expect(readSchemaVersion(sqlite)).toBe(version);
    expect(readFacts(sqlite)).toEqual(oldFacts);
    expect(readCards(sqlite)).toEqual(oldCards);
    expect(sqlite.prepare(`SELECT name FROM sqlite_schema
      WHERE type = 'trigger' AND name = 'daily_flow_node_review_update'`).get()).toBeUndefined();
  })
);

it.each(hosts)('keeps the original review facts and due dates when %s upgrades valid history', host =>
  withReviewHistory(host, validAt, async ({ sqlite, open, target }) => {
    const facts = readFacts(sqlite);
    await open(false);
    expect(readSchemaVersion(sqlite)).toBe(target);
    expect(readFacts(sqlite)).toEqual(facts);
    expect(readCards(sqlite)).toEqual([
      expect.objectContaining({ node_id: 'a-valid-card', due, reps: 1, stability_fast: expect.any(Number) }),
      expect.objectContaining({ node_id: 'z-legacy-card', due, reps: 1, stability_fast: expect.any(Number) })
    ]);
  })
);

it.each(hosts)('upgrades a legacy rollover date on %s without changing its original fact', async host => {
  let expectedCards: ReturnType<typeof readCards> = [];
  await withReviewHistory(host, validAt, async ({ sqlite, open }) => {
    await open(false);
    expectedCards = readCards(sqlite);
  });
  await withReviewHistory(host, legacyAt, async ({ sqlite, open, target }) => {
    const facts = readFacts(sqlite);
    await open(false);
    expect(readSchemaVersion(sqlite)).toBe(target);
    expect(readFacts(sqlite)).toEqual(facts);
    expect(readCards(sqlite)).toEqual(expectedCards);
    expect(readCards(sqlite)[1]).toMatchObject({ due, last_review_at: '2026-03-02T12:00:00.000Z', reps: 1 });
    await open(false);
    expect(readFacts(sqlite)).toEqual(facts);
    expect(readCards(sqlite)).toEqual(expectedCards);
  });
});

function framedReviewSource(row: unknown): FramedFactSource {
  const fact = projectFramedSyncReview(row);
  return async function* (_tx, kinds) {
    if (!kinds || kinds.includes(fact.kind)) yield fact;
  };
}

it.each(['framed', 'review-log'])('replays a legacy rollover via %s sync without changing its original fact', transport =>
  withReviewHistory('desktop', legacyAt, async ({ sqlite: source, open }) => {
    const target = new DatabaseSync('');
    try {
      const receiver = companionPort(target);
      await bootstrapCompanionDatabase(receiver, bootstrapRequest);
      target.exec(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
        VALUES ('z-legacy-card', 'item', 'Second card', '${due}', '${due}')`);
      const legacy = identityReviewRowSchema.parse(readFacts(source)[0]);
      const transfer = () => transport === 'review-log'
        ? applyReviewLogRecordsWithDbPort(receiver, [legacy])
        : applyFramedFactSources(receiver, [framedReviewSource(legacy)], {
          async loadBody() { throw new Error('Review facts have no body'); }
        });
      await transfer();
      expect(readFacts(target)).toEqual([legacy]);
      expect(readCards(target)).toEqual([
        expect.objectContaining({ last_review_at: '2026-03-02T12:00:00.000Z', reps: 1 })
      ]);
      await open(false);
      const saveScore = (reviewedAt: string) => receiver.transaction(tx => saveIosReviewWithDb(tx, {
        node_id: legacy.node_id, review_json: '{}',
        review_log_json: JSON.stringify({ opId: 'next-review', grade: 3, schedulerVersion: 'fsrs-7', reviewedAt })
      }));
      await expect(saveScore(legacyAt)).rejects.toThrow('invalid_review_timestamp');
      expect(readFacts(target)).toEqual([legacy]);
      await saveScore(due);
      const next = identityReviewRowSchema.parse(readFacts(target)[1]);
      await applyReviewLogRecordsWithDbPort(companionPort(source), [next]);
      const expected = [legacy, next];
      await transfer();
      expect(readFacts(target)).toEqual(expected);
      expect(readFacts(source).filter(row => row.node_id === legacy.node_id)).toEqual(expected);
      expect(readCards(target)).toEqual([readCards(source)[1]]);
      expect(readCards(target)[0]).toMatchObject({ last_review_at: due, reps: 2 });
    } finally {
      target.close();
    }
  })
);
