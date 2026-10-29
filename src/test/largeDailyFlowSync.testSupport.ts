import Database from 'better-sqlite3';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readDailyFlowFact } from '../../lib/core/flow/dailyFlowFactStorage.js';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService.js';
import type { DailyFlowSyncFact } from '../../lib/core/flow/dailyFlowSyncFact.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { companionDailyFlowPersistence } from '../shared/platform/companion/runtime/companionDailyFlow.js';

export const largeFlowNow = '2026-10-29T08:00:00.000Z';
export const largeFlowSettings = { scope: 'large-flow-source', newDayStartsAtHour: 4,
  pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };

// The shared library is the initial fixture. Only the daily list is created and transferred under test.
export function seedLargeFlowLibrary(db: Database.Database, count: number) {
  const insert = db.prepare(`INSERT INTO nodes (id, title, content, created_at, updated_at)
    VALUES (?, ?, 'Complete original reading material', ?, ?)`);
  db.transaction(() => {
    for (let index = 0; index < count; index++) {
      const id = `59700000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      insert.run(id, `Reading ${index}`, largeFlowNow, largeFlowNow);
    }
  })();
}

export async function createLargeFlow(file: string) {
  const db = new Database(file);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    db.prepare("INSERT OR REPLACE INTO companion_meta VALUES ('host_name', 'Source', ?)").run(largeFlowNow);
    const result = await openDailyFlow(createBetterSqliteDbPort(db),
      { now: largeFlowNow, mode: 'reading-only' }, largeFlowSettings, companionDailyFlowPersistence);
    const row = db.prepare('SELECT id, payload_json FROM daily_flow_sync_facts WHERE kind = ?').get('create') as {
      id: string; payload_json: string;
    };
    const fact = await readDailyFlowFact(createBetterSqliteDbPort(db), row.id);
    if (!fact) throw new Error('test_created_flow_missing');
    return { ...row, payload_json: JSON.stringify(fact), result, fact };
  } finally { db.close(); }
}

export function readPersistedLargeFlow(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    return {
      rows: db.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all(),
      facts: db.prepare('SELECT id, payload_json FROM daily_flow_sync_facts ORDER BY id').all(),
      factRows: db.prepare('SELECT * FROM daily_flow_fact_rows ORDER BY fact_id, slot, ordinal').all(),
      state: db.prepare('SELECT session_json FROM daily_flow_state WHERE id = 1').get(),
      learning: db.prepare('SELECT * FROM node_reading ORDER BY node_id').all(),
      reviews: db.prepare('SELECT * FROM review_log ORDER BY op_id').all()
    };
  } finally { db.close(); }
}

export async function advanceLargeFlow(file: string) {
  const db = new Database(file);
  try {
    const port = createBetterSqliteDbPort(db);
    const now = '2026-10-29T08:01:00.000Z';
    const opened = await openDailyFlow(port, { now, mode: 'reading-only' }, largeFlowSettings, companionDailyFlowPersistence);
    const session = opened.session;
    const snapshot = await companionDailyFlowPersistence.learningSnapshot(port, [session.currentNodeId!]);
    const reading = snapshot.nodesById[session.currentNodeId!]!.reading ?? null;
    return await commitDailyFlow(port, { opId: crypto.randomUUID(), now, token: session.daily!, sourceSession: session,
      readingAction: 'soon', readings: [{ nodeId: session.currentNodeId!, before: reading, after: reading }] },
    largeFlowSettings, companionDailyFlowPersistence);
  } finally { db.close(); }
}

export function migrateLegacyLargeFlow(file: string, fact: DailyFlowSyncFact) {
  const db = new Database(file);
  try {
    db.transaction(() => {
      db.exec('DROP TABLE daily_flow_projection_facts; DROP TABLE daily_flow_lists; DROP TABLE daily_flow_fact_rows');
      db.prepare('UPDATE daily_flow_sync_facts SET payload_json=? WHERE id=?').run(JSON.stringify(fact), fact.id);
      db.pragma('user_version=178');
    })();
    initializeDatabaseSchema(db);
  } finally { db.close(); }
}
