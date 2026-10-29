// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { migrateCycleFlow } from '../../lib/core/database/cycleFlowMigration.js';
import { DAILY_FLOW_SCHEMA } from '../../lib/core/database/dailyFlowSchema.js';
import { readLegacyCycleProjection } from '../../lib/core/flow/cycleFlowLegacy.js';
import { dailyFlowHistoryCommand } from '../../lib/core/flow/dailyFlowHistory.js';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService.js';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { compactFlowHistoryEntryAsync, restoreFlowHistoryEntryAsync } from '../../lib/core/flow/flowHistoryEntryAsync.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { companionDailyFlowPersistence } from '../shared/platform/companion/runtime/companionDailyFlow';

import { createTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';


const now = '2026-10-26T08:00:00.000Z';
const settings = { scope: 'legacy', newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';'));
  sqlite.exec('DROP TABLE daily_flow_entries; DROP TABLE daily_flow_operations; DROP TABLE daily_flow_state');
  sqlite.exec(DAILY_FLOW_SCHEMA.slice(0, 3).join(';'));
  sqlite.exec("INSERT INTO companion_meta VALUES ('host_name','legacy','now')");
  for (const id of ['a', 'b', 'waiting']) sqlite.prepare(
    "INSERT INTO nodes (id,kind,title,content,created_at,updated_at) VALUES (?,'topic',?,'Body',?,?)"
  ).run(id, id, id === 'waiting' ? '2026-10-26T08:10:00.000Z' : now, now);
  const before = { currentNodeId: 'a', queueNodeIds: ['a', 'b'], soonNodeIds: [] as string[], hiddenSoonNodeIds: [] as string[],
    totalNodeCount: 2, isAnswerRevealed: false, sessionStartedAt: now, currentItemStartedAt: now,
    readTopicCount: 0, reviewedItemCount: 0, readingElapsedMs: 0, reviewElapsedMs: 0, completedAt: null };
  const after = { ...before, currentNodeId: 'b', queueNodeIds: ['b'], soonNodeIds: ['a'], readTopicCount: 1 };
  sqlite.prepare('INSERT INTO daily_flow_state VALUES (1,?,7,?,?,?,0,?)').run('2026-10-25T20:00:00.000Z',
    JSON.stringify(settings), 'reading-only', JSON.stringify(after), now);
  for (const [index, id] of ['a', 'b', 'waiting'].entries()) sqlite.prepare(
    'INSERT INTO daily_flow_entries VALUES (?,?,?,?)').run(id, index, id === 'b' ? 0 : null, id === 'a' ? 0 : null);
  sqlite.exec("INSERT INTO daily_flow_operations VALUES ('old-op','unchanged-hash',7,'null')");
  sqlite.pragma('user_version = 103');
  const context = (reviewSession: typeof before) => ({ activeNodeId: reviewSession.currentNodeId, browseRootNodeId: '', reviewSession });
  const entry = createTopicDismissHistoryEntry({ id: 'old-soon', mutationTimestamp: now, nodeId: 'a', title: 'Soon Topic',
    beforeReading: null, afterReading: null, beforeContext: context(before), afterContext: context(after) });
  return { sqlite, before, after, entry, db: createBetterSqliteDbPort(sqlite) };
}

it('upgrades live order while preserving raw histories, headers, operation identities and node facts', async () => {
  const { sqlite, db, entry, after } = fixture();
  try {
    const compact = await compactFlowHistoryEntryAsync(entry);
    const raw = { undoStack: [compact], redoStack: [], resumeSession: after, header: { retain: 'unchanged' } };
    sqlite.prepare('INSERT INTO companion_meta VALUES (?,?,?)').run('flow_history:test', JSON.stringify(raw), now);
    const facts = sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
    await expect(db.transaction(tx => migrateCompanionDatabase(tx, 103, 104,
      () => { throw new Error('interrupted'); }))).rejects.toThrow('interrupted');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(103);
    expect(sqlite.prepare('SELECT value FROM companion_meta WHERE key=?').get('flow_history:test')).toEqual({ value: JSON.stringify(raw) });
    await db.transaction(tx => migrateCompanionDatabase(tx, 103, 104));
    const stored = JSON.parse((sqlite.prepare('SELECT value FROM companion_meta WHERE key=?').get('flow_history:test') as { value: string }).value);
    expect(stored.header).toEqual(raw.header);
    const tagged = stored.undoStack[0];
    expect(tagged.beforeContext.reviewSession.flowFormat).toBe('legacy-queue-v1');
    delete tagged.beforeContext.reviewSession.flowFormat; delete tagged.afterContext.reviewSession.flowFormat;
    expect(tagged).toEqual(compact);
    expect(sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(facts);
    expect(sqlite.prepare('SELECT op_id,input_hash,revision,card_json FROM daily_flow_operations').get())
      .toEqual({ op_id: 'old-op', input_hash: 'unchanged-hash', revision: 7, card_json: 'null' });
    expect((await readDailyFlow(db))?.session.currentNodeId).toBe('b');
    expect(sqlite.prepare('SELECT node_id FROM daily_flow_entries ORDER BY order_key').all())
      .toEqual(['b', 'a', 'waiting'].map(node_id => ({ node_id })));
  } finally { sqlite.close(); }
});

it('replays tagged old Soon deltas with their original guards and preserves complementary waiting identities', async () => {
  const { sqlite, db, entry } = fixture();
  try {
    sqlite.prepare('INSERT INTO companion_meta VALUES (?,?,?)').run('flow_history:test', JSON.stringify({
      undoStack: [await compactFlowHistoryEntryAsync(entry)], redoStack: [] }), now);
    await db.transaction(tx => migrateCompanionDatabase(tx, 103, 104));
    let session = (await openDailyFlow(db, { now, mode: 'reading-only' }, settings, companionDailyFlowPersistence)).session;
    const advanced = await commitDailyFlow(db, { opId: 'new-soon', now, token: session.daily!, sourceSession: session,
      readingAction: 'soon', readings: [{ nodeId: 'b', before: null, after: null }] }, settings, companionDailyFlowPersistence);
    expect(advanced.session.currentNodeId).toBe('a');
    const retainedHistory = (sqlite.prepare('SELECT value FROM companion_meta WHERE key=?').get('flow_history:test') as { value: string }).value;
    const mismatch = await readLegacyCycleProjection(db, settings, companionDailyFlowPersistence, now);
    await expect(restoreFlowHistoryEntryAsync(JSON.parse(retainedHistory).undoStack[0], mismatch)).rejects.toThrow();
    expect((sqlite.prepare('SELECT value FROM companion_meta WHERE key=?').get('flow_history:test') as { value: string }).value).toBe(retainedHistory);
    const newEntry = createTopicDismissHistoryEntry({ id: 'new-soon', mutationTimestamp: now, nodeId: 'b', title: 'Soon Topic',
      beforeReading: null, afterReading: null,
      beforeContext: { activeNodeId: 'b', browseRootNodeId: '', reviewSession: advanced.sourceSession! },
      afterContext: { activeNodeId: 'a', browseRootNodeId: '', reviewSession: advanced.session } });
    session = (await commitDailyFlow(db, dailyFlowHistoryCommand({ session: advanced.session, entry: newEntry, mode: 'undo', now }),
      settings, companionDailyFlowPersistence)).session;
    expect(session.currentNodeId).toBe('b');
    const raw = JSON.parse((sqlite.prepare('SELECT value FROM companion_meta WHERE key=?').get('flow_history:test') as { value: string }).value);
    const projection = await readLegacyCycleProjection(db, settings, companionDailyFlowPersistence, now);
    const restored = await restoreFlowHistoryEntryAsync(raw.undoStack[0], projection);
    session = (await commitDailyFlow(db, dailyFlowHistoryCommand({ session, entry: restored, mode: 'undo', now }),
      settings, companionDailyFlowPersistence)).session;
    expect(session.currentNodeId).toBe('a');
    session = (await openDailyFlow(db, { now, mode: 'reading-only' }, settings, companionDailyFlowPersistence)).session;
    expect(session.currentNodeId).toBe('a');
    expect(session.readTopicCount).toBe(0);
    session = (await commitDailyFlow(db, dailyFlowHistoryCommand({ session, entry: restored, mode: 'redo', now }),
      settings, companionDailyFlowPersistence)).session;
    expect(session.currentNodeId).toBe('b');
    session = (await openDailyFlow(db, { now, mode: 'reading-only' }, settings, companionDailyFlowPersistence)).session;
    expect(session.currentNodeId).toBe('b');
    expect(session.readTopicCount).toBe(1);
    expect(sqlite.prepare("SELECT active FROM daily_flow_entries WHERE node_id='waiting'").get()).toEqual({ active: 1 });
    expect(sqlite.prepare('SELECT * FROM node_reading').all()).toEqual([]);
    const root = mkdtempSync(path.join(os.tmpdir(), 'cycle-upgrade-'));
    try {
      const file = path.join(root, 'library.db');
      await sqlite.backup(file);
      const reopened = new Database(file);
      try {
        const resumed = await openDailyFlow(createBetterSqliteDbPort(reopened), { now, mode: 'reading-only' }, settings, companionDailyFlowPersistence);
        expect(resumed.session).toEqual(session);
      } finally { reopened.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  } finally { sqlite.close(); }
});

it('keeps desktop migration transactional when installing the new order fails', () => {
  const { sqlite } = fixture();
  try {
    const before = sqlite.prepare('SELECT * FROM daily_flow_entries').all();
    expect(() => sqlite.transaction(() => { migrateCycleFlow(sqlite); throw new Error('interrupted'); })()).toThrow('interrupted');
    expect(sqlite.prepare('SELECT * FROM daily_flow_entries').all()).toEqual(before);
  } finally { sqlite.close(); }
});
