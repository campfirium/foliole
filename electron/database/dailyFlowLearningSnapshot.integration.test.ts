// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

afterEach(closeLibraries);
const now = '2026-10-28T01:00:00.000Z';

async function library(count = 4) {
  await startLibraries();
  const peer = createPeer('desktop');
  const insert = peer.db.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES (?, 'topic', 'Topic', 'Complete original content', ?, ?)`);
  peer.db.transaction(() => {
    for (let index = 0; index < count; index++) insert.run(`topic-${index}`, now, now);
    peer.db.prepare('INSERT INTO node_reading (node_id,last_handled_at,next_at,priority,repetition_count) VALUES (?,?,?,?,?)')
      .run('topic-0', now, now, 7, 3);
    peer.db.prepare('INSERT INTO node_reading_host_state VALUES (?,?,?,?)').run('topic-0', 'desktop', 42, now);
    peer.db.prepare('INSERT INTO node_reading_host_state VALUES (?,?,?,?)').run('topic-0', 'other', 99, now);
    peer.db.prepare('INSERT INTO node_review (node_id,due,state,stability,reps,lapses) VALUES (?,?,?,?,?,?)')
      .run('topic-0', now, 2, 12.5, 5, 1);
    peer.db.prepare('INSERT INTO node_review (node_id,due) VALUES (?,?)').run('topic-1', now);
    peer.db.prepare('UPDATE nodes SET deleted_at=? WHERE id=?').run(now, 'topic-2');
    peer.db.prepare("UPDATE nodes SET content='   ' WHERE id='topic-3'").run();
  })();
  return peer;
}

function observe(port: DbPort, onRead: (sql: string, rows: DbRow[]) => void): DbPort {
  return { run: port.run.bind(port),
    async query<T extends DbRow>(sql: string, params = []) {
      const rows = await port.query<T>(sql, params);
      onRead(sql, rows);
      return rows;
    },
    transaction: task => port.transaction(tx => task(observe(tx, onRead))) };
}

it('preserves complete host learning facts and scoped results while omitting empty learning columns from large reads', async () => {
  const peer = await library(5000);
  let transportedBytes = 0;
  const snapshot = await loadDailyFlowLearningSnapshot(observe(peer.port, (_sql, rows) => {
    transportedBytes += Buffer.byteLength(JSON.stringify(rows));
  }), 'desktop');
  expect(snapshot.nodeOrder).toHaveLength(5000);
  expect(snapshot.trashedNodeIds).toEqual(['topic-2']);
  expect(snapshot.nodesById['topic-0']).toMatchObject({
    reading: { priority: 7, repetitionCount: 3, readingPosition: 42 },
    review: { due: now, state: 2, stability: 12.5, reps: 5, lapses: 1 }
  });
  expect(snapshot.nodesById['topic-1']).toMatchObject({ reading: null, review: { due: now } });
  expect(snapshot.nodesById['topic-3']).toMatchObject({ hasContent: false, reading: null, review: null });
  const scoped = await loadDailyFlowLearningSnapshot(peer.port, 'desktop', ['topic-3', 'topic-0', 'missing']);
  expect(scoped.nodeOrder).toEqual(['topic-3', 'topic-0', 'missing']);
  expect(scoped.nodesById).toEqual({ 'topic-0': snapshot.nodesById['topic-0'], 'topic-3': snapshot.nodesById['topic-3'] });
  expect((await loadDailyFlowLearningSnapshot(peer.port, 'other', ['topic-0'])).nodesById['topic-0']?.reading?.readingPosition).toBe(99);
  expect((await loadDailyFlowLearningSnapshot(peer.port, 'desktop', [])).nodesById).toEqual({});
  // Sparse source facts should fit inside the complete normalized result, rather than
  // repeating every absent reading/review field for every untouched node over the bridge.
  expect(transportedBytes).toBeLessThan(Buffer.byteLength(JSON.stringify(snapshot)));
});

it('reads node eligibility and learning facts from one SQLite snapshot during a concurrent committed update', async () => {
  const peer: Peer = await library();
  peer.db.pragma('journal_mode = WAL');
  const writer = new Database(peer.file);
  let changed = false;
  try {
    const port = createBetterSqliteDbPort(peer.db, { transactionMode: 'deferred' });
    const snapshot = await loadDailyFlowLearningSnapshot(observe(port, (sql) => {
      if (changed || !sql.includes('FROM nodes n')) return;
      changed = true;
      writer.transaction(() => {
        writer.prepare('UPDATE nodes SET priority=9 WHERE id=?').run('topic-0');
        writer.prepare('UPDATE node_reading SET repetition_count=8 WHERE node_id=?').run('topic-0');
      })();
    }), 'desktop');
    expect(changed).toBe(true);
    expect(snapshot.nodesById['topic-0']).toMatchObject({ priority: null, reading: { repetitionCount: 3 } });
    expect((await loadDailyFlowLearningSnapshot(port, 'desktop')).nodesById['topic-0'])
      .toMatchObject({ priority: 9, reading: { repetitionCount: 8 } });
  } finally { writer.close(); }
});

it('combines owned node metadata with fresh learning facts and rejects an incomplete metadata view', async () => {
  const peer = await library();
  peer.db.prepare("UPDATE nodes SET priority=0 WHERE id='topic-0'").run();
  peer.db.prepare("UPDATE nodes SET parent_id='topic-2' WHERE id='topic-3'").run();
  const full = await loadDailyFlowLearningSnapshot(peer.port, 'desktop');
  const metadata = new Map(Object.values(full.nodesById).map(node => [node.id, {
    id: node.id, parentNodeId: node.parentNodeId, priority: node.priority ?? null,
    createdAt: node.createdAt, deletedAt: node.deletedAt ?? null, kind: node.kind, shelvedAt: node.shelvedAt ?? null,
    hasContent: node.hasContent === true, hasReveal: node.hasReveal === true
  }]));
  const combined = await loadDailyFlowLearningSnapshot(peer.port, 'desktop', undefined, metadata);
  expect(combined).toEqual(full);
  expect(combined.nodesById['topic-0']).toMatchObject({ priority: 0,
    reading: { readingPosition: 42, repetitionCount: 3 }, review: { stability: 12.5, reps: 5 } });
  const scoped = await loadDailyFlowLearningSnapshot(peer.port, 'desktop', ['topic-0'], new Map());
  expect(scoped.nodesById['topic-0']).toEqual(full.nodesById['topic-0']);
  metadata.delete('topic-3');
  await expect(loadDailyFlowLearningSnapshot(peer.port, 'desktop', undefined, metadata))
    .rejects.toThrow('daily_flow_node_metadata_missing');
  expect((await loadDailyFlowLearningSnapshot(peer.port, 'desktop')).nodesById).toEqual(full.nodesById);
});
