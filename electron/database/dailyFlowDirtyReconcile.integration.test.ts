// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { loadDerivedNodeOrderWithDbPort } from '../../lib/core/database/parentChildOrder.js';
import { readDailyFlowFact, storeDailyFlowFact } from '../../lib/core/flow/dailyFlowFactStorage.js';
import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { measureSqlStatements } from './sqlStatementMeter.testSupport.js';

const now = '2026-11-26T08:00:00.000Z';
const yesterday = '2026-11-25T08:00:00.000Z';
const dueLater = '2026-11-28T08:00:00.000Z';
const settings = { scope: 'test-library', newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
const unavailable = async (): Promise<never> => { throw new Error('Unexpected learning write'); };
const openConnections: Database.Database[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const db of openConnections.splice(0)) db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(host: 'desktop' | 'phone', padding = 24) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'flow-dirty-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'library.db'));
  openConnections.push(sqlite);
  sqlite.pragma('foreign_keys = ON');
  const db = createBetterSqliteDbPort(sqlite);
  if (host === 'desktop') initializeDatabaseSchema(sqlite);
  else await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: host, now });
  seed(sqlite, padding);
  let fullReads = 0;
  const persistence: DailyFlowPersistence = {
    async learningSnapshot(tx, ids) {
      const snapshot = await loadDailyFlowLearningSnapshot(tx, host, ids);
      if (ids) return snapshot;
      fullReads++;
      return { ...snapshot, nodeOrder: await loadDerivedNodeOrderWithDbPort(tx, undefined, host === 'phone') };
    },
    snapshot: unavailable, grade: unavailable, reading: unavailable, reviewHistory: unavailable
  };
  return { sqlite, db, persistence, fullReads: () => fullReads,
    open: (mode: 'recommended' | 'reading-only' | 'review-first' = 'recommended') =>
      openDailyFlow(db, { now, mode }, settings, persistence) };
}

function seed(sqlite: Database.Database, padding: number) {
  const node = sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, priority, title, content, reveal, created_at, updated_at)
    VALUES (?, ?, ?, 4, ?, ?, ?, ?, ?)`);
  const read = sqlite.prepare("INSERT INTO node_reading (node_id, next_at, last_handled_at, state) VALUES (?, ?, ?, 'active')");
  const review = sqlite.prepare('INSERT INTO node_review (node_id, due) VALUES (?, ?)');
  sqlite.transaction(() => {
    node.run('parent', null, 'folder', 'Parent', '', null, now, now);
    for (const id of ['reading-a', 'reading-b']) {
      node.run(id, 'parent', 'topic', id, 'Body', null, now, now);
      read.run(id, now, yesterday);
    }
    node.run('review', 'parent', 'item', 'Review', 'Question', 'Answer', now, now);
    review.run('review', now);
    for (let index = 0; index < padding; index++) {
      const id = `untouched-${index}`;
      node.run(id, null, 'topic', id, 'Unrelated body', null, now, now);
      read.run(id, now, yesterday);
    }
  })();
}

function queue(sqlite: Database.Database) {
  return ['daily_flow_entries', 'daily_flow_entry_readiness']
    .map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY node_id`).all());
}

function mutate(sqlite: Database.Database, operation: number, toggle: boolean) {
  switch (operation) {
    case 0: sqlite.prepare("UPDATE nodes SET deleted_at=? WHERE id='parent'").run(toggle ? now : null); break;
    case 1: sqlite.prepare("UPDATE nodes SET shelved_at=? WHERE id='parent'").run(toggle ? now : null); break;
    case 2: sqlite.prepare("UPDATE node_review SET due=? WHERE node_id='review'").run(toggle ? dueLater : now); break;
    case 3: sqlite.prepare("UPDATE nodes SET parent_id=? WHERE id='reading-a'").run(toggle ? null : 'parent'); break;
    case 4: sqlite.prepare("UPDATE nodes SET content=? WHERE id='reading-b'").run(toggle ? '' : 'Body'); break;
    case 5: sqlite.prepare("UPDATE node_reading SET next_at=? WHERE node_id='reading-a'").run(toggle ? dueLater : now); break;
  }
  // Change a learning fact without shifting its eligibility, as happens when another item is studied.
  sqlite.exec("UPDATE node_review SET reps=reps+1 WHERE node_id='review'");
}

it.each(['desktop', 'phone'] as const)('matches the whole-list reconcile row for row on %s', async host => {
  const targeted = await fixture(host);
  const full = await fixture(host);
  expect(await targeted.open()).toEqual(await full.open());
  let random = 83;
  for (let step = 0; step < 48; step++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const operation = (random >>> 16) % 6;
    const toggle = Boolean(random & 1);
    mutate(targeted.sqlite, operation, toggle);
    mutate(full.sqlite, operation, toggle);
    full.sqlite.exec('UPDATE daily_flow_state SET scope_complete=0');
    expect(await targeted.open(), `operation ${step}`).toEqual(await full.open());
    expect(queue(targeted.sqlite), `persisted rows after operation ${step}`).toEqual(queue(full.sqlite));
  }
  expect(full.fullReads()).toBe(49);
  expect(targeted.fullReads()).toBe(1);
});

it.each(['desktop', 'phone'] as const)('bounds SQLite reads when reopening Flow on %s after one task changes', async host => {
  const costs = [];
  for (const padding of [200, 600]) {
    const library = await fixture(host, padding);
    const before = await library.open('reading-only');
    library.sqlite.prepare("UPDATE node_reading SET next_at=? WHERE node_id='reading-a'").run(dueLater);
    const { result, report } = await measureSqlStatements(() => library.open('reading-only'));
    expect(result.session.cycle!.remaining).toBe(before.session.cycle!.remaining - 1);
    expect(library.sqlite.prepare("SELECT active FROM daily_flow_entries WHERE node_id='reading-a'").pluck().get()).toBe(0);
    costs.push({ rows: report.rowsRead, statements: report.statements, bytes: Buffer.byteLength(JSON.stringify(result)) });
  }
  const [small, large] = costs;
  expect(small).toBeDefined();
  expect(large).toBeDefined();
  for (const metric of ['rows', 'statements', 'bytes'] as const) {
    expect(large![metric], `${host} ${metric}: ${small![metric]} -> ${large![metric]}`)
      .toBeLessThanOrEqual(small![metric] * 1.5 + (metric === 'bytes' ? 4096 : 20));
  }
});

it.each(['reading-only', 'review-first'] as const)('replays a peer action in %s without corrupting task counts', async mode => {
  const targeted = await fixture('desktop');
  const full = await fixture('desktop');
  const results = [];
  for (const library of [targeted, full]) {
    await library.open(mode);
    const rootId = library.sqlite.prepare("SELECT id FROM daily_flow_sync_facts WHERE kind='create'").pluck().get() as string;
    const root = (await readDailyFlowFact(library.db, rootId))!;
    await storeDailyFlowFact(library.db, { ...root, id: 'remote-read', kind: 'advance', parentId: root.id,
      nodeId: 'reading-a', action: 'read', rows: [], statsDelta: {
        readingElapsedMs: 10, reviewElapsedMs: 0, readTopicCount: 1, reviewedItemCount: 0
      } });
    if (library === full) library.sqlite.exec('UPDATE daily_flow_state SET scope_complete=0');
    results.push(await library.open(mode));
    expect(library.sqlite.prepare("SELECT initial_task FROM daily_flow_entries WHERE node_id='reading-a'").pluck().get()).toBe(0);
  }
  expect(results[0]).toEqual(results[1]);
  expect(queue(targeted.sqlite)).toEqual(queue(full.sqlite));
  expect(targeted.fullReads()).toBe(mode === 'reading-only' ? 2 : 1);
  expect(full.fullReads()).toBe(2);
});
