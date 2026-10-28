// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { readCycleRows } from '../../lib/core/flow/dailyFlowStorage.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

const now = '2026-10-28T08:00:00.000Z';
const unsupported = async (): Promise<never> => { throw new Error('Generation must not write learning facts.'); };
const persistence: DailyFlowPersistence = {
  learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, 'desktop', ids),
  snapshot: unsupported, grade: unsupported, reading: unsupported, reviewHistory: unsupported
};
afterEach(closeLibraries);

function seed(peer: Peer, kind: 'topic' | 'item') {
  const insert = peer.db.prepare(`INSERT INTO nodes
    (id, parent_id, kind, priority, title, content, reveal, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const add = (id: string, parent: string | null, nodeKind: 'folder' | 'topic' | 'item' = kind, priority = 5) => {
    insert.run(id, parent, nodeKind, priority, id, nodeKind === 'folder' ? '' : `Complete body ${id}`,
      nodeKind === 'item' ? `Answer ${id}` : null, '2026-01-01T00:00:00.000Z', now);
    if (nodeKind === 'item') peer.db.prepare(`INSERT INTO node_review
      (node_id, due, last_review_at, state, stability, reps) VALUES (?, ?, '2026-10-20T00:00:00.000Z', 2, 1, 2)`)
      .run(id, id === 'future' ? '2026-10-30T00:00:00.000Z' : '2026-10-27T00:00:00.000Z');
    if (nodeKind === 'topic') peer.db.prepare(`INSERT INTO node_reading
      (node_id, next_at, interval_duration_ms, last_handled_at, state)
      VALUES (?, ?, 86400000, '2026-10-20T00:00:00.000Z', 'active')`)
      .run(id, id === 'future' ? '2026-10-30T00:00:00.000Z' : '2026-10-27T00:00:00.000Z');
  };
  const ids: string[] = [];
  peer.db.transaction(() => {
    [10, 5, 4, 3].forEach((count, source) => {
      const folder = `source-${source}`;
      add(folder, null, 'folder');
      for (let index = 0; index < count; index++) {
        const id = `${source}-${String(index).padStart(2, '0')}`;
        add(id, folder);
        ids.push(id);
      }
    });
    add('absolute', null, kind, 0);
    add('future', null);
  })();
  return ['absolute', ...ids];
}

function originalFacts(peer: Peer) {
  return ['nodes', 'node_reading', 'node_review'].map(table => peer.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

it.each(['topic', 'item'] as const)('%s first generation persists complete interleaving and reuses it after reopening', async kind => {
  await startLibraries();
  const peer = createPeer('desktop');
  const expected = seed(peer, kind);
  const before = originalFacts(peer);
  const settings = { scope: peer.file, newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
  const mode = kind === 'topic' ? 'reading-only' : 'review-first';
  const opened = await openDailyFlow(peer.port, { now, mode }, settings, persistence);
  const rows = await readCycleRows(peer.port);
  const ordered = rows.map(row => row.node_id);
  expect(ordered.slice().sort()).toEqual(expected.slice().sort());
  expect(ordered[0]).toBe('absolute');
  expect(rows.every(row => row.initial_task === 1 && row.active === 1)).toBe(true);
  const regular = ordered.slice(1);
  expect(regular.every((id, index) => index === 0 || id[0] !== regular[index - 1]![0])).toBe(true);
  for (let source = 0; source < 4; source++) {
    expect(regular.filter(id => id.startsWith(`${source}-`))).toEqual(expected.filter(id => id.startsWith(`${source}-`)));
  }
  expect(opened.session.currentNodeId).toBe('absolute');
  expect(opened.session.totalNodeCount).toBe(expected.length);
  expect(originalFacts(peer)).toEqual(before);

  const reopenedSqlite = new Database(peer.file);
  try {
    const db = createBetterSqliteDbPort(reopenedSqlite);
    const learningSnapshot: DailyFlowPersistence['learningSnapshot'] = async (tx, ids) => {
      expect(ids, 'A persisted daily list must not reload all-library planning facts').toBeDefined();
      expect(ids!.length).toBeLessThan(expected.length);
      return loadDailyFlowLearningSnapshot(tx, 'desktop', ids);
    };
    const reopened = await openDailyFlow(db, { now, mode }, settings, { ...persistence, learningSnapshot });
    expect(reopened.session).toEqual(opened.session);
    expect(await readCycleRows(db)).toEqual(rows);
  } finally {
    reopenedSqlite.close();
  }
});
