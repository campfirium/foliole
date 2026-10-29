// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, node, open, setupPeers } from '../test/dailyFlowExceptions.testSupport';
import { historyEntry, replayHistory } from '../test/dailyFlowHistorySync.testSupport';

const stamp = '2026-10-26T08:01:00.000Z';
afterEach(closeLibraries);

it.each(['desktop', 'companion'] as const)('upgrades %s atomically without rebuilding live rows or losing undo', async host => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const initial = await readCycleRows(peer.port);
  expect(initial).toEqual([]);
  const entry = await historyEntry(peer, 'a', 'soon', stamp);
  const rows = await readCycleRows(peer.port);
  const stored = await readDailyFlow(peer.port);
  const facts = peer.db.prepare('SELECT * FROM daily_flow_sync_facts ORDER BY id').all();
  const relations = peer.db.prepare('SELECT * FROM daily_flow_fact_rows ORDER BY fact_id,slot,ordinal').all();
  const root = peer.db.prepare("SELECT id FROM daily_flow_sync_facts WHERE kind='create'").pluck().get() as string;
  peer.db.prepare(`INSERT INTO sync_object_state
    (object_type,object_id,state_seq,content_hash,last_modified_by_host_name,updated_at,sync_dirty)
    VALUES('daily_flow',?,999,?,'local',?,1)`).run(root, 'c'.repeat(64), stamp);
  const oldVersion = host === 'desktop' ? 180 : 108;
  const nextVersion = host === 'desktop' ? 181 : 109;
  peer.db.exec(`DROP TABLE daily_flow_local_operation_rows; DROP TABLE daily_flow_local_operation_state;
    DROP INDEX daily_flow_action_time; PRAGMA user_version=${oldVersion}`);
  const migrate = async (fail = false) => {
    const interrupt = () => { if (fail) throw new Error('interrupted'); };
    if (host === 'desktop') initializeDatabaseSchema(peer.db, { beforeVersionCommit: interrupt });
    else await peer.port.transaction(tx => migrateCompanionDatabase(tx, oldVersion, nextVersion, interrupt));
  };
  await expect(migrate(true)).rejects.toThrow('interrupted');
  expect(peer.db.pragma('user_version', { simple: true })).toBe(oldVersion);
  expect(peer.db.prepare("SELECT sync_dirty FROM sync_object_state WHERE object_type='daily_flow' AND object_id=?").pluck().get(root)).toBe(1);
  expect(peer.db.prepare("SELECT name FROM sqlite_master WHERE name='daily_flow_local_operation_rows'").get()).toBeUndefined();
  expect(await readCycleRows(peer.port)).toEqual(rows);
  await migrate();
  expect(peer.db.pragma('user_version', { simple: true })).toBe(nextVersion);
  expect(peer.db.prepare("SELECT sync_dirty,content_hash FROM sync_object_state WHERE object_type='daily_flow' AND object_id=?").get(root))
    .toEqual({ sync_dirty: 0, content_hash: 'c'.repeat(64) });
  expect(await readCycleRows(peer.port)).toEqual(rows);
  expect(await readDailyFlow(peer.port)).toEqual(stored);
  expect(peer.db.prepare('SELECT * FROM daily_flow_sync_facts ORDER BY id').all()).toEqual(facts);
  expect(peer.db.prepare('SELECT * FROM daily_flow_fact_rows ORDER BY fact_id,slot,ordinal').all()).toEqual(relations);
  expect((await open(peer, stamp)).readTopicCount).toBe(1);
  const restored = await replayHistory(peer, await open(peer, stamp), entry, 'undo', stamp);
  expect(restored.session.readTopicCount).toBe(0);
  expect((await readCycleRows(peer.port, ['a']))[0]).toMatchObject({ node_id: 'a', initial_task: 1, handled: 0 });
  await act(peer, restored.session, 'soon', '2026-10-26T08:02:00.000Z');
  expect((await open(peer, '2026-10-27T08:00:00.000Z')).readTopicCount).toBe(0);
  expect(peer.db.prepare('SELECT DISTINCT day_key FROM daily_flow_local_operation_rows').all()).toEqual([]);
});
