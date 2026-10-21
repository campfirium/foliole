// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { pruneLearningRowsWithoutVisibleNodes } from '../../lib/core/sync/syncNodeVisibilityPruning.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('does not turn an ordinary snapshot without reading into a deletion fact', () => {
  const peer = createPeer('snapshot-source');
  edit(peer, 'Original body');
  upsertNodeSnapshot(peer.driver, { nodeId: 'topic', hostName: peer.name,
    anchorLink: null, content: 'Updated body', createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z', kind: 'topic', title: 'Topic',
    isTitleManual: true, parentNodeId: null, position: null, reveal: null, reading: null });
  expect(peer.db.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_reading'").all()).toEqual([]);
});

it('propagates an explicit reading removal when the local reading is already absent', async () => {
  const source = createPeer('removal-source'); const target = createPeer('removal-target');
  joinPeers(source, target);
  edit(source, 'Keep the topic and its history');
  await syncRequestLibrary(source, target);
  saveNodeReadingStateWithSync(target.driver, { nodeId: 'topic', hostName: target.name,
    updatedAt: '2026-10-06T00:00:00.000Z', reading: {
      intervalDurationMs: 1000, intervalGrowthFactor: 1.5,
      lastHandledAt: '2026-10-06T00:00:00.000Z', nextAt: '2026-10-09T00:00:00.000Z',
      priority: 1, readingPosition: 128, repetitionCount: 2, state: 'active'
    } });
  const versions = target.db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const nodes = target.db.prepare('SELECT * FROM nodes ORDER BY id').all();
  const deletedAt = '2026-10-21T00:00:00.000Z';
  saveNodeReadingStateWithSync(source.driver, {
    nodeId: 'topic', hostName: source.name, reading: null, updatedAt: deletedAt
  });
  expect(source.db.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'topic'")
    .pluck().get()).toBe(deletedAt);
  for (let replay = 0; replay < 2; replay++) {
    await syncRequestLibrary(source, target);
    const reopened = new Database(target.file, { readonly: true });
    try {
      expect(reopened.prepare('SELECT * FROM node_reading').all()).toEqual([]);
      expect(reopened.prepare('SELECT * FROM node_reading_host_state').all()).toEqual([]);
      expect(reopened.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(nodes);
      expect(reopened.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
      expect(reopened.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'topic'")
        .pluck().get()).toBe(deletedAt);
    } finally { reopened.close(); }
  }
});

it('persists every shared reading field through repeated current requests', async () => {
  const source = createPeer('reading-source'); const target = createPeer('reading-target');
  joinPeers(source, target);
  edit(source, 'same body');
  await syncRequestLibrary(source, target);
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name,
    reading: { intervalDurationMs: 123456, intervalGrowthFactor: 2.75,
      lastHandledAt: '2026-10-06T00:00:00.000Z', nextAt: '2026-10-09T00:00:00.000Z',
      priority: 3, readingPosition: 0, repetitionCount: 7, state: 'active' },
    updatedAt: '2026-10-06T00:00:00.000Z' });
  await syncRequestLibrary(source, target);
  await syncRequestLibrary(source, target);
  const query = `SELECT node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
    next_at, priority, repetition_count, state FROM node_reading`;
  expect(target.db.prepare(query).all()).toEqual(source.db.prepare(query).all());
});

it('propagates later reading state changes without inventing another reading repetition', async () => {
  const source = createPeer('unlock-source'); const target = createPeer('unlock-target');
  joinPeers(source, target);
  edit(source, 'Sequential reading topic');
  const reading = {
    intervalDurationMs: 1000, intervalGrowthFactor: 1,
    lastHandledAt: '2026-10-18T01:00:00.000Z', nextAt: '2026-10-19T01:00:00.000Z',
    priority: 1, readingPosition: 0, repetitionCount: 0, state: 'locked' as const
  };
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name, reading,
    updatedAt: '2026-10-18T01:00:00.000Z' });
  await syncRequestLibrary(source, target);
  expect(target.db.prepare("SELECT state FROM node_reading WHERE node_id = 'topic'").pluck().get()).toBe('locked');
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name,
    reading: { ...reading, state: 'active' }, updatedAt: '2026-10-18T02:00:00.000Z' });
  await syncRequestLibrary(source, target);
  await syncRequestLibrary(target, source);
  const query = "SELECT state, last_handled_at, repetition_count FROM node_reading WHERE node_id = 'topic'";
  expect(target.db.prepare(query).get()).toEqual({
    state: 'active', last_handled_at: reading.lastHandledAt, repetition_count: 0
  });
  expect(source.db.prepare(query).get()).toEqual(target.db.prepare(query).get());
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name, reading,
    updatedAt: '2026-10-18T03:00:00.000Z' });
  await syncRequestLibrary(source, target);
  expect(target.db.prepare(query).get()).toEqual({
    state: 'locked', last_handled_at: reading.lastHandledAt, repetition_count: 0
  });
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name,
    reading: { ...reading, state: 'active' }, updatedAt: '2026-10-18T02:00:00.000Z' });
  await syncRequestLibrary(source, target);
  expect(target.db.prepare(query).get()).toEqual({
    state: 'locked', last_handled_at: reading.lastHandledAt, repetition_count: 0
  });
  await syncRequestLibrary(target, source);
  expect(source.db.prepare(query).get()).toEqual(target.db.prepare(query).get());
});

it('prunes clean orphan learning records while preserving live, dirty and deleted state', async () => {
  const peer = createPeer('learning-pruning');
  edit(peer, 'Visible topic');
  peer.db.exec(`INSERT INTO node_reading (node_id, last_handled_at, next_at) VALUES ('topic', 'now', 'now');
    INSERT INTO node_review (node_id, due) VALUES ('topic', 'now')`);
  const insert = peer.db.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
    SELECT ?, ?, COALESCE(MAX(state_seq), 0) + 1, 'hash', 'host', 'now', ?, ? FROM sync_object_state`);
  const records: Array<[string, string, number, string | null]> = [
    ['node_reading', 'topic', 0, null], ['node_review', 'topic', 0, null],
    ['node_reading', 'missing-reading', 0, null], ['node_review', 'missing-review', 0, null],
    ['node_review', 'dirty-review', 1, null], ['node_review', 'deleted-review', 0, 'now'],
    ['node_reading', 'deleted-reading', 0, 'now'], ['setting', 'unrelated', 0, null]
  ];
  for (const record of records) insert.run(...record);
  const before = peer.db.prepare<[], { object_id: string }>(
    'SELECT * FROM sync_object_state ORDER BY object_type, object_id').all();
  await pruneLearningRowsWithoutVisibleNodes(createBetterSqliteDbPort(peer.db));
  expect(peer.db.prepare('SELECT * FROM sync_object_state ORDER BY object_type, object_id').all())
    .toEqual(before.filter(row => row.object_id !== 'missing-reading' && row.object_id !== 'missing-review'));
});
