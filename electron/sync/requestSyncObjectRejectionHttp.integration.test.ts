// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { loadDesktopReadingResume, saveDesktopReadingResume } from '../database/readingResume.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { groupKey, record, state, syncServer, type Peer } from './requestSyncDatabaseHttp.testSupport.js';

it.each(['push', 'pull'] as const)('commits objects before and after an oversized body and leaves only that object pending (%s)', async direction => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const sender = direction === 'push' ? source : target;
  const receiver = direction === 'push' ? target : source;
  const server = syncServer(source, target);
  const rejected: string[] = [];
  try {
    const body = textBranch('b-v1', 'x'.repeat(1_048_577));
    const oversized = { ...body, object_id: 'b', snapshot: { ...body.snapshot, id: 'b' } };
    const dependent = record('d', 'd-v1');
    dependent.snapshot.parent_id = 'b';
    await applyConvergentSyncNodesWithDbPort(sender.db, [record('a', 'a-v1'),
      oversized, record('c', 'c-v1'), dependent]);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const exchange = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    const run = () => runRequestSyncDatabaseRound({
      exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
      transferObjects: differences => transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }),
      reportObjectError: (difference, error, stage) => rejected.push(`${difference.globalId}:${stage}:${(error as Error).message}`)
    });
    expect(await run()).toMatchObject({ complete: false, pending: 2, transferred: 2, onlyRejectedObjectsPending: true });
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
    await fixture.close();
  }
});

it.each([
  ['push', false, 'object'], ['pull', false, 'object'], ['push', true, 'object'], ['pull', true, 'object'],
  ['pull', false, 'transaction'], ['pull', false, 'commit']
] as const)('isolates recoverable writes (%s, history %s, fault %s)', async (direction, withHistory, fault) => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const sender = direction === 'push' ? source : target;
  const receiver = direction === 'push' ? target : source;
  const server = syncServer(source, target);
  const rejected: string[] = [];
  try {
    const dependent = record('aa', 'aa-v1');
    dependent.snapshot.parent_id = 'b';
    const earlier = withHistory ? record('b', 'b-base') : undefined;
    await applyConvergentSyncNodesWithDbPort(sender.db, [record('a', 'a-v1'), record('b', 'b-v1', earlier),
      record('c', 'c-v1'), dependent, ...(earlier ? [earlier] : [])]);
    if (withHistory) await seedStoredHead(sender, receiver);
    const observation = observeRejectedWrite(receiver, fault);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const exchange = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    const run = () => runRequestSyncDatabaseRound({
      exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
      transferObjects: differences => transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }),
      reportObjectError: (difference, error, stage) => rejected.push(`${difference.globalId}:${stage}:${(error as Error).message}`)
    });
    if (fault !== 'object') {
      await assertFailedWriteTransaction(receiver, run, observation, fault);
      return;
    }
    expect(await run()).toMatchObject({ complete: false, pending: withHistory ? 3 : 2, transferred: withHistory ? 3 : 2, onlyRejectedObjectsPending: true });
    expect(rejected).toEqual(['b:apply:sync_node_apply_blocked:b']);
    receiver.reopen();
    expect(await receiver.db.query("SELECT id FROM nodes WHERE id IN ('a','aa','b','c') ORDER BY id"))
      .toEqual([{ id: 'a' }, { id: 'c' }]);
    expect(await receiver.db.query("SELECT version_id FROM node_sync_versions WHERE object_id IN ('a','aa','b','c') ORDER BY object_id"))
      .toEqual([{ version_id: 'a-v1' }, { version_id: 'c-v1' }]);
    expect(observation.writes.toSorted()).toEqual(['a', 'b', 'c']);
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
  observation: ReturnType<typeof observeRejectedWrite>, fault: 'transaction' | 'commit') {
  await expect(run()).rejects.toThrow(fault === 'transaction'
    ? 'request_sync_object_savepoint_failed' : 'FOREIGN KEY constraint failed');
  expect(observation.writes.toSorted()).toEqual(fault === 'transaction' ? ['a', 'b'] : ['a', 'aa', 'b', 'c']);
  expect(observation.commits()).toBe(fault === 'transaction' ? 0 : 1);
  receiver.reopen();
  expect(await receiver.db.query('SELECT id FROM nodes')).toEqual([]);
  expect(await receiver.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
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
