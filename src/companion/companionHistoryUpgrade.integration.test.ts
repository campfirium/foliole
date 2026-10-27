// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor';
import { DAILY_FLOW_SCHEMA } from '../../lib/core/database/dailyFlowSchema';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { restoreFlowHistoryEntry } from '../../lib/core/flow/flowHistoryEntry';
import { restoreFlowHistorySession } from '../../lib/core/flow/flowHistorySession';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract';

import { createHistoryDeltaFixture, historyKey } from './companionHistoryDelta.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let app: Awaited<ReturnType<typeof createHistoryDeltaFixture>>;
afterEach(async () => { await app?.library.close(); });

function legacySession(session: DailyFlowSession) {
  const rows = app.db.prepare('SELECT * FROM daily_flow_entries WHERE active=1 ORDER BY order_key').all() as { node_id: string; cohort: string }[];
  const result = { ...session };
  delete result.cycle; delete result.flowFormat; delete result.daily;
  return { ...result, queueNodeIds: rows.filter(row => row.cohort === 'queue').map(row => row.node_id),
    soonNodeIds: rows.filter(row => row.cohort === 'soon' && row.node_id !== session.currentNodeId).map(row => row.node_id) };
}

async function legacyHistory(kind: 'reading' | 'grade' = 'reading') {
  app = await createHistoryDeltaFixture(kind === 'reading');
  await app.open();
  const before = legacySession(app.session);
  await app.action(kind === 'grade' ? 'grade' : 'soon');
  const middle = legacySession(app.session);
  const first = restoreFlowHistoryEntry((await app.history()).undoStack.at(-1)!, app.session);
  await app.action(kind === 'grade' ? 'grade' : 'read');
  const after = legacySession(app.session);
  await app.replay('undo');
  const second = restoreFlowHistoryEntry((await app.history()).redoStack.at(-1)!, app.session);
  if (first.type === 'nodes.change' || second.type === 'nodes.change') throw new Error('wrong_entry');
  const history = { undoStack: [{ ...first, beforeContext: { ...first.beforeContext, reviewSession: before },
    afterContext: { ...first.afterContext, reviewSession: middle } }],
  redoStack: [{ ...second, beforeContext: { ...second.beforeContext, reviewSession: middle },
    afterContext: { ...second.afterContext, reviewSession: after } }] };
  const ids = (app.db.prepare('SELECT node_id FROM daily_flow_entries ORDER BY order_key').all() as { node_id: string }[]).map(row => row.node_id);
  app.db.exec('DROP TABLE daily_flow_entries');
  app.db.exec(DAILY_FLOW_SCHEMA[1]);
  for (const [index, id] of ids.entries()) app.db.prepare('INSERT INTO daily_flow_entries VALUES (?,?,?,?)').run(id, index,
    middle.queueNodeIds.includes(id) ? middle.queueNodeIds.indexOf(id) : null,
    middle.soonNodeIds.includes(id) ? middle.soonNodeIds.indexOf(id) : null);
  app.db.exec('ALTER TABLE daily_flow_operations DROP COLUMN source_session_json');
  app.db.prepare('UPDATE daily_flow_state SET session_json=?, invalidated=0').run(JSON.stringify(middle));
  app.db.prepare('UPDATE companion_meta SET value=? WHERE key=?').run(JSON.stringify(history), historyKey);
  app.db.pragma('user_version=102');
  app.session = middle;
  return history;
}

it.each(['reading', 'grade'] as const)('upgrades existing valid %s undo and redo once, preserving facts, order, and replay after reopen', async kind => {
  const original = await legacyHistory(kind);
  const facts = app.db.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
  const reviews = app.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  const cards = app.db.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  const state = app.db.prepare('SELECT day_key, revision, mode, settings_key FROM daily_flow_state').get();
  const cursor = structuredClone(app.session);
  await app.reopen();
  expect(app.db.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
  expect(app.db.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(facts);
  expect(app.db.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(reviews);
  expect(app.db.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(cards);
  expect(app.db.prepare('SELECT day_key, revision, mode, settings_key FROM daily_flow_state').get()).toEqual(state);
  await app.open();
  const saved = await app.history();
  expect(saved.undoStack.map(entry => restoreFlowHistoryEntry(entry, cursor))).toMatchObject(original.undoStack);
  expect(saved.redoStack.map(entry => restoreFlowHistoryEntry(entry, cursor))).toMatchObject(original.redoStack);
  const encoded = app.db.prepare('SELECT value FROM companion_meta WHERE key=?').pluck().get(historyKey) as string;
  expect(encoded).not.toContain('"queueNodeIds":["');
  const oldEncoding = JSON.parse(encoded).redoStack.at(-1);
  await app.replay('redo');
  const replayedEncoding = JSON.parse(app.db.prepare('SELECT value FROM companion_meta WHERE key=?').pluck().get(historyKey) as string).undoStack.at(-1);
  if (replayedEncoding.type === 'nodes.change') throw new Error('wrong_entry');
  expect(replayedEncoding.beforeContext.reviewSession.queueHistory).toEqual(oldEncoding.beforeContext.reviewSession.queueHistory);
  expect(replayedEncoding.afterContext.reviewSession.queueHistory).toEqual(oldEncoding.afterContext.reviewSession.queueHistory);
  const after = structuredClone(app.session);
  await app.reopen();
  await app.open();
  await app.replay('undo');
  expect(app.session.currentNodeId).toBe(cursor.currentNodeId);
  await app.replay('redo');
  expect(app.session.queueNodeIds).toEqual(after.queueNodeIds);
});

it('rolls back the entire history upgrade and version when its write fails', async () => {
  await legacyHistory();
  const original = app.db.prepare('SELECT * FROM companion_meta ORDER BY key').all();
  app.db.exec("CREATE TRIGGER reject_upgrade BEFORE UPDATE ON companion_meta WHEN OLD.key LIKE 'flow_history:%' BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  const db = createBetterSqliteDbPort(app.db);
  await expect(db.transaction(tx => migrateCompanionDatabase(tx, 102, COMPANION_DATABASE_VERSION))).rejects.toThrow('disk full');
  expect(app.db.pragma('user_version', { simple: true })).toBe(102);
  expect(app.db.prepare('SELECT * FROM companion_meta ORDER BY key').all()).toEqual(original);
});

it('rejects an unreadable legacy entry without dropping any record or changing the version', async () => {
  const history = await legacyHistory();
  const invalid = JSON.parse(JSON.stringify(history));
  invalid.redoStack[0].beforeContext.reviewSession.queueNodeIds = null;
  const encoded = JSON.stringify(invalid);
  app.db.prepare('UPDATE companion_meta SET value=? WHERE key=?').run(encoded, historyKey);
  const db = createBetterSqliteDbPort(app.db);
  await expect(db.transaction(tx => migrateCompanionDatabase(tx, 102, COMPANION_DATABASE_VERSION))).rejects.toThrow();
  expect(app.db.prepare('SELECT value FROM companion_meta WHERE key=?').pluck().get(historyKey)).toBe(encoded);
  expect(app.db.pragma('user_version', { simple: true })).toBe(102);
});

it('retains the sole resume cursor for a pre-daily library rather than losing its valid history', async () => {
  const original = await legacyHistory();
  app.db.exec('DELETE FROM daily_flow_state');
  const db = createBetterSqliteDbPort(app.db);
  await db.transaction(tx => migrateCompanionDatabase(tx, 102, COMPANION_DATABASE_VERSION));
  const saved = await app.history();
  expect(saved.resumeSession).toMatchObject(original.undoStack[0]!.afterContext.reviewSession);
  const entry = saved.undoStack[0]!;
  expect(entry.type).toBe('topic.dismiss');
  if (entry.type !== 'topic.dismiss') throw new Error('wrong_entry');
  expect(restoreFlowHistorySession(entry.beforeContext.reviewSession, saved.resumeSession!))
    .toMatchObject(original.undoStack[0]!.beforeContext.reviewSession);
});

it('upgrades a large legacy stack without returning the complete history across the database bridge', async () => {
  const original = await legacyHistory();
  const queue = Array.from({ length: 10000 }, (_, index) => `retained-library-node-${index.toString().padStart(6, '0')}`);
  const entry = original.undoStack[0]!;
  const expand = (session: typeof entry.beforeContext.reviewSession) => ({ ...session,
    queueNodeIds: [...session.queueNodeIds, ...queue], totalNodeCount: session.totalNodeCount + queue.length });
  const largeEntry = { ...entry,
    beforeContext: { ...entry.beforeContext, reviewSession: expand(entry.beforeContext.reviewSession) },
    afterContext: { ...entry.afterContext, reviewSession: expand(entry.afterContext.reviewSession) } };
  const large = { undoStack: Array.from({ length: 12 }, (_, index) => ({ ...largeEntry, id: `retained-${index}` })),
    redoStack: [largeEntry], extraFact: 'keep unknown fields' };
  const encoded = JSON.stringify(large);
  expect(Buffer.byteLength(encoded)).toBeGreaterThan(4 * 1024 * 1024);
  app.db.prepare('UPDATE companion_meta SET value=? WHERE key=?').run(encoded, historyKey);
  const db = createBetterSqliteDbPort(app.db);
  const query = db.query.bind(db);
  const payloadBytes: number[] = [];
  vi.spyOn(db, 'query').mockImplementation(async (...args) => {
    const result = await query(...args);
    payloadBytes.push(Buffer.byteLength(JSON.stringify(result)));
    return result;
  });
  await db.transaction(tx => migrateCompanionDatabase(tx, 102, COMPANION_DATABASE_VERSION));
  expect(payloadBytes.length).toBeGreaterThan(0);
  expect(Math.max(...payloadBytes)).toBeLessThan(2 * 1024 * 1024);
  const saved = app.db.prepare('SELECT value FROM companion_meta WHERE key=?').pluck().get(historyKey) as string;
  const parsed = JSON.parse(saved);
  expect(parsed.extraFact).toBe(large.extraFact);
  expect(parsed.undoStack.map((value: typeof largeEntry) =>
    restoreFlowHistoryEntry(value, largeEntry.beforeContext.reviewSession))).toMatchObject(large.undoStack);
  expect(parsed.redoStack.map((value: typeof largeEntry) =>
    restoreFlowHistoryEntry(value, largeEntry.beforeContext.reviewSession))).toMatchObject(large.redoStack);
});
