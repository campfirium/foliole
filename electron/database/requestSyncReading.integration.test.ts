// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { pruneLearningRowsWithoutVisibleNodes } from '../../lib/core/sync/syncNodeVisibilityPruning.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

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
