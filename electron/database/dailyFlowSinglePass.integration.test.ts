// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

const now = '2026-10-28T08:00:00.000Z';
const later = '2026-10-28T08:10:00.000Z';
const unsupported = async (): Promise<never> => { throw new Error('Generation must preserve learning facts.'); };
const persistence: DailyFlowPersistence = {
  learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, 'desktop', ids),
  snapshot: unsupported, grade: unsupported, reading: unsupported, reviewHistory: unsupported
};
const settings = (peer: Peer) => ({ scope: peer.file, newDayStartsAtHour: 4,
  pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue });
afterEach(async () => { vi.useRealTimers(); await closeLibraries(); });

function add(peer: Peer, id: string, parent: string | null, kind = 'topic', due = now) {
  peer.db.prepare(`INSERT INTO nodes (id,parent_id,kind,priority,title,content,reveal,created_at,updated_at)
    VALUES (?,?,?,4,?,?,?,'2026-01-01T00:00:00.000Z',?)`)
    .run(id, parent, kind, id, kind === 'folder' ? '' : `Body ${id}`, kind === 'item' ? 'Answer' : null, now);
  if (kind === 'topic') peer.db.prepare(`INSERT INTO node_reading
    (node_id,next_at,last_handled_at,interval_duration_ms,state) VALUES (?,?,?,86400000,'active')`).run(id, due, now);
  if (kind === 'item') peer.db.prepare('INSERT INTO node_review (node_id,due,scheduled_days) VALUES (?,?,0)').run(id, due);
}
function facts(peer: Peer) {
  return ['nodes', 'node_reading', 'node_review'].map(table => peer.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}
it.each(['recommended', 'review-first', 'reading-only'] as const)(
  'interleaves the complete learning day once and derives the initial cohort in %s', async mode => {
    await startLibraries();
    const peer = createPeer('desktop');
    add(peer, 'source-a', null, 'folder'); add(peer, 'source-b', null, 'folder');
    for (const id of ['a1', 'a2', 'a3', 'a4']) add(peer, id, 'source-a');
    add(peer, 'b1', 'source-b'); add(peer, 'b2', 'source-b', 'topic', later);
    add(peer, 'tomorrow', 'source-b', 'topic', '2026-10-30T08:00:00.000Z');
    const before = facts(peer);
    const result = await openDailyFlow(peer.port, { now, mode }, settings(peer), persistence);
    const rows = await readCycleRows(peer.port);
    // Independent expected result: four A members split by both B members, including the later B.
    expect(rows.map(row => row.node_id)).toEqual(['a1', 'b1', 'a2', 'a3', 'b2', 'a4']);
    expect(rows.filter(row => row.initial_task).map(row => row.node_id))
      .toEqual(mode === 'review-first' ? [] : ['a1', 'b1', 'a2', 'a3', 'a4']);
    expect(result.session).toMatchObject({ currentNodeId: mode === 'review-first' ? null : 'a1',
      totalNodeCount: mode === 'review-first' ? 0 : 5,
      cycle: { remaining: mode === 'review-first' ? 0 : 5, clearKey: mode === 'review-first' ? 0 : 6 } });
    const connection = new Database(peer.file);
    try {
      const db = createBetterSqliteDbPort(connection);
      const reopened = await openDailyFlow(db, { now, mode }, settings(peer), { ...persistence,
        learningSnapshot: (tx, ids) => {
          expect(ids).toBeDefined();
          return persistence.learningSnapshot(tx, ids);
        } });
      expect(reopened.session).toEqual(result.session);
      expect(await readCycleRows(db)).toEqual(rows);
    } finally { connection.close(); }
    expect(facts(peer)).toEqual(before);
  }
);
it('keeps Queue Cleared while all members wait and selects them only on explicit re-entry', async () => {
  await startLibraries();
  const peer = createPeer('desktop');
  add(peer, 'reading', null, 'topic', later); add(peer, 'review', null, 'item', later);
  const first = await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), persistence);
  expect(first.session).toMatchObject({ currentNodeId: null, totalNodeCount: 0,
    completedAt: now, cycle: { remaining: 0, clearKey: 0, clearedAt: now } });
  const rows = await readCycleRows(peer.port);
  expect(rows.map(row => [row.node_id, row.initial_task])).toEqual([['review', 0], ['reading', 0]]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  await vi.advanceTimersByTimeAsync(600000);
  expect((await readDailyFlow(peer.port))?.session).toEqual(first.session);
  vi.useRealTimers();
  const reopened = await openDailyFlow(peer.port, { now: later, mode: 'recommended' }, settings(peer), persistence);
  expect(reopened.session.currentNodeId).toBe('review');
  expect(reopened.session.totalNodeCount).toBe(0);
  expect(await readCycleRows(peer.port)).toEqual(rows);
});
it('rolls back the entire generated list when the session save fails', async () => {
  await startLibraries();
  const peer = createPeer('desktop');
  add(peer, 'reading', null); add(peer, 'review', null, 'item', later);
  const before = facts(peer);
  peer.db.exec(`CREATE TEMP TRIGGER reject_first_save BEFORE INSERT ON daily_flow_state
    BEGIN SELECT RAISE(ABORT, 'first save failed'); END`);
  await expect(openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), persistence))
    .rejects.toThrow('first save failed');
  expect(await readDailyFlow(peer.port)).toBeNull();
  expect(await readCycleRows(peer.port)).toEqual([]);
  expect(facts(peer)).toEqual(before);
});

it('derives startup fallback from the same snapshot as day-end membership', async () => {
  await startLibraries();
  const peer = createPeer('desktop');
  add(peer, 'reading', null);
  let libraryReads = 0;
  const result = await openDailyFlow(peer.port, { now, mode: 'review-first', startup: true }, settings(peer),
    { ...persistence, learningSnapshot: (db, ids) => {
      if (!ids) libraryReads++;
      return persistence.learningSnapshot(db, ids);
    } });
  expect(result).toMatchObject({ mode: 'recommended', session: { currentNodeId: 'reading', totalNodeCount: 1 } });
  expect(libraryReads).toBe(1);
});
it('retains seed tasks, Soon and preferred start before the daily continuation', async () => {
  await startLibraries();
  const peer = createPeer('desktop');
  for (const id of ['a', 'b', 'c', 'extension']) add(peer, id, null);
  add(peer, 'later', null, 'topic', later);
  const seed = { currentNodeId: 'b', queueNodeIds: ['b', 'a'], soonNodeIds: ['c'], isAnswerRevealed: false,
    totalNodeCount: 4, readTopicCount: 2, readingElapsedMs: 1200, sessionStartedAt: now, currentItemStartedAt: now };
  const result = await openDailyFlow(peer.port, { now, mode: 'reading-only', seed, preferredNodeId: 'a' }, settings(peer), persistence);
  expect(result.session).toMatchObject({ currentNodeId: 'a', totalNodeCount: 4, readTopicCount: 2,
    readingElapsedMs: 1200, cycle: { remaining: 2, clearKey: 2 } });
  expect((await readCycleRows(peer.port)).map(row => [row.node_id, row.cohort, row.initial_task]))
    .toEqual([['a', 'queue', 1], ['b', 'queue', 1], ['c', 'soon', 0], ['extension', 'none', 0], ['later', 'none', 0]]);
});

it.each(['recommended', 'review-first', 'reading-only'] as const)(
  'preserves mixed-kind mode counts without truncating daily membership in %s', async mode => {
    await startLibraries();
    const peer = createPeer('desktop');
    const reviews = ['f1', 'f2', 'f3', 'f4', 'f5'];
    for (const id of reviews) add(peer, id, null, 'item');
    add(peer, 'f6', null, 'item', later);
    add(peer, 'r1', null); add(peer, 'r2', null, 'topic', later);
    peer.db.exec('UPDATE nodes SET priority=0');
    const result = await openDailyFlow(peer.port, { now, mode }, settings(peer), persistence);
    const rows = await readCycleRows(peer.port);
    expect(rows.map(row => row.node_id)).toEqual(mode === 'reading-only'
      ? ['r1', ...reviews, 'f6', 'r2'] : [...reviews, 'r1', 'f6', 'r2']);
    expect(rows.filter(row => row.initial_task).map(row => row.node_id))
      .toEqual(mode === 'reading-only' ? ['r1'] : reviews);
    expect(result.session).toMatchObject({ currentNodeId: mode === 'reading-only' ? 'r1' : 'f1',
      totalNodeCount: mode === 'reading-only' ? 1 : 5,
      cycle: { remaining: mode === 'reading-only' ? 1 : 5, reviewRemaining: mode === 'reading-only' ? 0 : 5,
        clearKey: mode === 'reading-only' ? 1 : 5, tailKey: 8 } });
  }
);
