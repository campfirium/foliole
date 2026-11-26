// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { loadDesktopReadingResume, saveDesktopReadingResume } from '../database/readingResume.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { record, startSyncRound, syncServer, type Peer } from './requestSyncDatabaseHttp.testSupport.js';
import { observeSavepointBridge } from './requestSyncSavepointBridge.testSupport.js';

it.each([
  ['push', false], ['pull', false], ['pull', true]
] as const)('commits objects before and after an oversized body (%s, control failure %s)', async (direction, failHandoff) => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const sender = direction === 'push' ? source : target;
  const receiver = direction === 'push' ? target : source;
  const server = syncServer(source, target);
  const rejected: string[] = [];
  const bridge = observeSavepointBridge(receiver, failHandoff);
  try {
    const body = textBranch('b-v1', 'x'.repeat(1_048_577));
    const oversized = { ...body, object_id: 'b', snapshot: { ...body.snapshot, id: 'b' } };
    const dependent = record('d', 'd-v1');
    dependent.snapshot.parent_id = 'b';
    await applyConvergentSyncNodesWithDbPort(sender.db, [record('a', 'a-v1'),
      oversized, record('c', 'c-v1'), dependent]);
    const run = await startSyncRound(server, source, target, rejected);
    if (failHandoff) {
      await expect(run()).rejects.toThrow('request_sync_object_savepoint_failed');
      expect(bridge.controls).toEqual([['SAVEPOINT'], ['RELEASE', 'SAVEPOINT']]);
      expect(bridge.applied).not.toHaveBeenCalled();
      receiver.reopen();
      expect(await receiver.db.query('SELECT id FROM nodes')).toEqual([]);
      expect(await receiver.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
      bridge.controls.length = 0;
    }
    expect(await run()).toMatchObject({ complete: false, pending: 2, transferred: 2, onlyRejectedObjectsPending: true });
    expect(bridge.controls).toEqual([['SAVEPOINT'], ['RELEASE', 'SAVEPOINT'], ['RELEASE']]);
    expect(rejected).toEqual(['b:prepare:request_sync_body_too_large']);
    receiver.reopen();
    expect(await receiver.db.query("SELECT id, current_version_id FROM nodes WHERE id IN ('a', 'b', 'c', 'd') ORDER BY id"))
      .toEqual([{ id: 'a', current_version_id: 'a-v1' }, { id: 'c', current_version_id: 'c-v1' }]);
    const repaired = record('b', 'b-v2', oversized);
    await applyConvergentSyncNodesWithDbPort(sender.db, [repaired]);
    expect(await run()).toMatchObject({ complete: true, pending: 0 });
    receiver.reopen();
    expect(await receiver.db.query("SELECT current_version_id FROM nodes WHERE id = 'b'"))
      .toEqual([{ current_version_id: 'b-v2' }]);
    expect(await receiver.db.query("SELECT parent_id FROM nodes WHERE id = 'd'")).toEqual([{ parent_id: 'b' }]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    bridge.restore();
    await fixture.close();
  }
});

it.each([
  ['push', false, 'object'], ['pull', false, 'object'], ['push', true, 'object'], ['pull', true, 'object'],
  ['pull', false, 'transaction'], ['push', false, 'commit'], ['pull', false, 'commit']
] as const)('isolates recoverable writes (%s, history %s, fault %s)', async (direction, withHistory, fault) => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const sender = direction === 'push' ? source : target;
  const receiver = direction === 'push' ? target : source;
  const server = syncServer(source, target);
  const rejected: string[] = [];
  let bridge: ReturnType<typeof observeSavepointBridge> | undefined;
  try {
    const dependent = record('aa', 'aa-v1');
    dependent.snapshot.parent_id = 'b';
    const earlier = withHistory ? record('b', 'b-base') : undefined;
    await applyConvergentSyncNodesWithDbPort(sender.db, [record('a', 'a-v1'), record('b', 'b-v1', earlier),
      record('c', 'c-v1'), dependent, ...(earlier ? [earlier] : [])]);
    if (withHistory) await seedStoredHead(sender, receiver);
    const observation = observeRejectedWrite(receiver, fault);
    if (fault === 'object') bridge = observeSavepointBridge(receiver);
    const run = await startSyncRound(server, source, target, rejected);
    if (fault === 'transaction') {
      await assertFailedWriteTransaction(receiver, run, observation);
      return;
    }
    if (fault === 'commit') {
      await assertIsolatedCommitFailure(receiver, run, rejected);
      return;
    }
    expect(await run()).toMatchObject({ complete: false, pending: withHistory ? 3 : 2, transferred: withHistory ? 3 : 2, onlyRejectedObjectsPending: true });
    expect(rejected).toEqual(['b:apply:sync_node_apply_blocked:b']);
    expect(bridge?.controls).toContainEqual(['RELEASE', 'SAVEPOINT']);
    expect(bridge?.controls).toContainEqual(['ROLLBACK']);
    expect(bridge?.applied.mock.calls.map(([object]) => object.globalId)).not.toContain('b');
    receiver.reopen();
    expect(await receiver.db.query("SELECT id FROM nodes WHERE id IN ('a','aa','b','c') ORDER BY id"))
      .toEqual([{ id: 'a' }, { id: 'c' }]);
    expect(await receiver.db.query("SELECT version_id FROM node_sync_versions WHERE object_id IN ('a','aa','b','c') ORDER BY object_id"))
      .toEqual([{ version_id: 'a-v1' }, { version_id: 'c-v1' }]);
    expect([...observation.writes].sort()).toEqual(['a', 'b', 'c']);
    expect(observation.commits()).toBe(1);
    if (withHistory) expect(await receiver.db.query("SELECT last_opened_at FROM node_open_state WHERE node_id = 'held'"))
      .toEqual([{ last_opened_at: '2026-11-11T00:00:00Z' }]);
    receiver.sqlite.exec('DROP TRIGGER reject_one_object');
    expect(await run()).toMatchObject({ complete: true, pending: 0 });
    receiver.reopen();
    expect(await receiver.db.query("SELECT current_version_id FROM nodes WHERE id = 'b'"))
      .toEqual([{ current_version_id: 'b-v1' }]);
    expect(await receiver.db.query("SELECT parent_id FROM nodes WHERE id = 'aa'"))
      .toEqual([{ parent_id: 'b' }]);
    if (withHistory) expect(loadDesktopReadingResume(createBetterSqlite3Driver(receiver.sqlite), 'b')?.offset).toBe(2);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    bridge?.restore();
    await fixture.close();
  }
});

it('uses one fewer bridge call per adjacent success across a 200-object HTTP transfer', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const server = syncServer(source, target);
  const bridge = observeSavepointBridge(target);
  const nodes = Array.from({ length: 200 }, (_, index) => record(`node-${index}`, `version-${index}`));
  try {
    await applyConvergentSyncNodesWithDbPort(source.db, nodes);
    const run = await startSyncRound(server, source, target, []);
    expect(await run()).toMatchObject({ complete: true, pending: 0, transferred: nodes.length });
    const starts = bridge.controls.filter(operations => operations.length === 1 && operations[0] === 'SAVEPOINT');
    const handoffs = bridge.controls.filter(operations => operations.length === 2);
    expect(starts.length).toBeGreaterThan(0);
    expect(handoffs.length).toBeGreaterThan(0);
    expect(starts.length + handoffs.length).toBe(nodes.length);
    expect(bridge.controls).toHaveLength(nodes.length + starts.length);
    expect(bridge.applied).toHaveBeenCalledTimes(nodes.length);
    target.reopen();
    expect(await target.db.query('SELECT count(*) AS count FROM nodes')).toEqual([{ count: nodes.length }]);
    expect(await target.db.query('SELECT count(*) AS count FROM node_sync_versions')).toEqual([{ count: nodes.length }]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    bridge.restore();
    await fixture.close();
  }
});

async function seedStoredHead(sender: Peer, receiver: Peer) {
  const held = record('held', 'held-v1');
  await applyConvergentSyncNodesWithDbPort(sender.db, [held]);
  await applyConvergentSyncNodesWithDbPort(receiver.db, [held]);
  const payload = { node_id: 'held', last_opened_at: '2026-11-11T00:00:00Z' };
  await sender.db.transaction(tx => applySyncObjectInTransaction(tx, { object_type: 'node_open_state', object_id: 'held',
    payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('node_open_state', payload),
    updated_at: payload.last_opened_at, deleted_at: null }));
  const driver = createBetterSqlite3Driver(sender.sqlite);
  const context = loadDesktopReadingResume(driver, 'b');
  if (!context) throw new Error('missing_reading_position');
  saveDesktopReadingResume(driver, { context, offset: 2, hostName: sender.id, updatedAt: '2026-11-11T00:00:00Z' });
}

async function assertFailedWriteTransaction(receiver: Peer, run: () => Promise<unknown>,
  observation: ReturnType<typeof observeRejectedWrite>) {
  await expect(run()).rejects.toThrow('request_sync_object_savepoint_failed');
  expect([...observation.writes].sort()).toEqual(['a', 'b']);
  expect(observation.commits()).toBe(0);
  receiver.reopen();
  expect(await receiver.db.query('SELECT id FROM nodes')).toEqual([]);
  expect(await receiver.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
}

/** A commit that fails for one object is replayed object by object, so the others still land. */
async function assertIsolatedCommitFailure(receiver: Peer, run: () => Promise<unknown>, rejected: string[]) {
  expect(await run()).toMatchObject({ complete: false, pending: 2, transferred: 2, onlyRejectedObjectsPending: true });
  expect(rejected).toEqual([expect.stringContaining('b:apply:FOREIGN KEY constraint failed')]);
  receiver.reopen();
  expect(await receiver.db.query("SELECT id FROM nodes WHERE id IN ('a','aa','b','c') ORDER BY id"))
    .toEqual([{ id: 'a' }, { id: 'c' }]);
  receiver.sqlite.exec('DROP TRIGGER reject_one_object');
  expect(await run()).toMatchObject({ complete: true, pending: 0 });
}

function observeRejectedWrite(receiver: Peer, fault: 'object' | 'transaction' | 'commit') {
  const writes: string[] = [];
  let writesInTransaction = false;
  let writeCommits = 0;
  receiver.sqlite.close();
  receiver.sqlite = new Database(receiver.file, { verbose: sql => {
    if (sql === 'COMMIT' && writesInTransaction) writeCommits++;
    if (sql === 'COMMIT' || sql === 'ROLLBACK') writesInTransaction = false;
  } });
  receiver.sqlite.function('observe_node_write', (id: string) => {
    writes.push(id);
    writesInTransaction = true;
    return null;
  });
  if (fault === 'commit') receiver.sqlite.exec(`
    CREATE TABLE missing_reference (id TEXT PRIMARY KEY);
    CREATE TABLE commit_failure (ref TEXT REFERENCES missing_reference(id) DEFERRABLE INITIALLY DEFERRED);
  `);
  const reject = fault === 'commit' ? "INSERT INTO commit_failure SELECT 'missing' WHERE NEW.id = 'b';"
    : `SELECT CASE WHEN NEW.id = 'b' THEN RAISE(${fault === 'transaction' ? 'ROLLBACK' : 'ABORT'}, 'sync_node_apply_blocked:b') END;`;
  receiver.sqlite.exec(`CREATE TRIGGER reject_one_object BEFORE INSERT ON nodes
    WHEN NEW.id IN ('a', 'aa', 'b', 'c') BEGIN
      SELECT observe_node_write(NEW.id);
      ${reject}
    END`);
  return { writes, commits: () => writeCommits };
}
