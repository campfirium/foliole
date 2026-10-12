// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { closeRequestSyncReadonlyConnections, withRequestSyncReadonlySnapshot } from './requestSyncReadonlySnapshot.js';

const roots: string[] = [];
const writers: Database.Database[] = [];
afterEach(async () => {
  closeRequestSyncReadonlyConnections();
  for (const writer of writers.splice(0)) writer.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});

async function library() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'request-readonly-'));
  roots.push(root);
  const file = path.join(root, 'library.db');
  const writer = new Database(file);
  writers.push(writer);
  writer.pragma('journal_mode = WAL');
  writer.exec('CREATE TABLE value (n INTEGER); INSERT INTO value VALUES (1)');
  return { file, writer };
}

it('opens one connection for successive snapshots while seeing newly committed writes', async () => {
  vi.stubEnv('FOLIOLE_REQUEST_SYNC_DIAGNOSTICS', '1');
  const output = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const { file, writer } = await library();
  expect(await withRequestSyncReadonlySnapshot(file, db => db.query('SELECT n FROM value'))).toEqual([{ n: 1 }]);
  writer.exec('UPDATE value SET n = 2');
  expect(await withRequestSyncReadonlySnapshot(file, db => db.query('SELECT n FROM value'))).toEqual([{ n: 2 }]);
  const opened = output.mock.calls.filter(([line]) => String(line).includes('request_sync_snapshot_opened'));
  expect(opened).toHaveLength(1);
});

function gate() {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

it('keeps concurrent requests in separate snapshots without holding the writer', async () => {
  const { file, writer } = await library();
  const entered = gate(); const finish = gate();
  const first = withRequestSyncReadonlySnapshot(file, async db => {
    expect(await db.query('SELECT n FROM value')).toEqual([{ n: 1 }]);
    entered.release(); await finish.promise;
    expect(await db.query('SELECT n FROM value')).toEqual([{ n: 1 }]);
  });
  await entered.promise;
  let secondEntered = false;
  const second = withRequestSyncReadonlySnapshot(file, async db => {
    secondEntered = true;
    expect(await db.query('SELECT n FROM value')).toEqual([{ n: 2 }]);
  });
  writer.exec('UPDATE value SET n = 2');
  expect(secondEntered).toBe(false);
  finish.release(); await Promise.all([first, second]);
  expect(writer.pragma('wal_checkpoint(TRUNCATE)')).toEqual([{ busy: 0, log: 0, checkpointed: 0 }]);
});

it('cancels active and queued requests, then reuses the connection with a fresh snapshot', async () => {
  const { file, writer } = await library();
  const entered = gate(); const finish = gate();
  const active = new AbortController(); const queued = new AbortController();
  const first = withRequestSyncReadonlySnapshot(file, async db => {
    await db.query('SELECT n FROM value'); entered.release(); await finish.promise;
  }, active.signal);
  const rejectedFirst = expect(first).rejects.toThrow('active_cancelled');
  await entered.promise;
  const execute = vi.fn(async () => undefined);
  const second = withRequestSyncReadonlySnapshot(file, execute, queued.signal);
  const rejectedSecond = expect(second).rejects.toThrow('queued_cancelled');
  active.abort(new Error('active_cancelled')); queued.abort(new Error('queued_cancelled'));
  finish.release(); await Promise.all([rejectedFirst, rejectedSecond]);
  expect(execute).not.toHaveBeenCalled();
  writer.exec('UPDATE value SET n = 3');
  expect(await withRequestSyncReadonlySnapshot(file, db => db.query('SELECT n FROM value'))).toEqual([{ n: 3 }]);
});

it('invalidates active and queued scopes on library close and opens the next library independently', async () => {
  const previous = await library(); const next = await library();
  next.writer.exec('UPDATE value SET n = 9');
  const entered = gate(); const finish = gate();
  const first = withRequestSyncReadonlySnapshot(previous.file, async db => {
    await db.query('SELECT n FROM value'); entered.release(); await finish.promise;
    await db.query('SELECT n FROM value');
  });
  const rejectedFirst = expect(first).rejects.toThrow('request_sync_library_closed');
  await entered.promise;
  const execute = vi.fn(async () => undefined);
  const second = withRequestSyncReadonlySnapshot(previous.file, execute);
  const rejectedSecond = expect(second).rejects.toThrow('request_sync_library_closed');
  closeRequestSyncReadonlyConnections();
  expect(await withRequestSyncReadonlySnapshot(next.file, db => db.query('SELECT n FROM value'))).toEqual([{ n: 9 }]);
  finish.release(); await Promise.all([rejectedFirst, rejectedSecond]);
  expect(execute).not.toHaveBeenCalled();
  expect(previous.writer.pragma('wal_checkpoint(TRUNCATE)')).toEqual([{ busy: 0, log: 0, checkpointed: 0 }]);
});

it('reopens a replaced database at the same path after closing the library', async () => {
  const { file, writer } = await library();
  await withRequestSyncReadonlySnapshot(file, db => db.query('SELECT n FROM value'));
  closeRequestSyncReadonlyConnections();
  writer.close(); writers.splice(writers.indexOf(writer), 1);
  await rm(file);
  const replacement = new Database(file); writers.push(replacement);
  replacement.exec('CREATE TABLE value (n INTEGER); INSERT INTO value VALUES (7)');
  expect(await withRequestSyncReadonlySnapshot(file, db => db.query('SELECT n FROM value'))).toEqual([{ n: 7 }]);
});
