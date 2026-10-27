// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession.js';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';

let tempRoot = '';
const now = '2026-10-26T08:00:00.000Z';
vi.mock('../deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'preparation', libraryPath })
}));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: tempRoot,
  app_cache_dir: path.join(tempRoot, 'cache'), app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs') }) }));

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { commitDesktopDailyFlow, openDesktopDailyFlow } from './dailyFlow.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import * as snapshots from './requestSyncReadonlySnapshot.js';
import { loadWorkspaceNodeDocument } from './workspaceNodeDocument.js';

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'flow-document-'));
  initializeDatabase();
  for (const id of ['a', 'b', 'c']) seed(id, `Body ${id}`);
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(async () => { closeDatabaseConnection(); vi.restoreAllMocks(); vi.useRealTimers(); await rm(tempRoot, { recursive: true, force: true }); });

function seed(id: string, content: string, flush = true) {
  upsertNodeSnapshot({ nodeId: id, title: id, kind: 'topic', parentNodeId: null, content, reveal: null,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: now, updatedAt: now });
  const { driver } = openDatabaseConnection();
  if (flush) flushNodeSyncVersionWithDriver(driver, id, requireDatabaseHostName(driver), now);
}
function soon(session: DailyFlowSession, opId: string) {
  return commitDesktopDailyFlow({ opId, now, token: session.daily!, sourceSession: session, readingAction: 'soon',
    readings: [{ nodeId: session.currentNodeId!, before: null, after: null }] });
}
const stored = () => readDailyFlow(createBetterSqliteDbPort(openDatabaseConnection().sqlite));
const bodyReads = (calls: [string, ...unknown[]][]) => calls.filter(([sql]) => sql.includes('SELECT n.id, n.kind, n.content'));

it('prepares a successor in the original runtime and serves it through the existing document read without changing the cursor', async () => {
  const { session } = await openDesktopDailyFlow({ now, mode: 'reading-only' });
  const connection = openDatabaseConnection();
  const reads = vi.spyOn(connection.driver, 'queryOne');
  expect(bodyReads(reads.mock.calls)).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(16);
  expect(bodyReads(reads.mock.calls)).toHaveLength(1);
  const rows = connection.driver.queryAll<{ node_id: string }>('SELECT node_id FROM daily_flow_entries ORDER BY order_key');
  const next = rows[1]!.node_id;
  reads.mockClear();
  expect(loadWorkspaceNodeDocument(next)?.content).toBe(`Body ${next}`);
  expect(bodyReads(reads.mock.calls)).toHaveLength(0);
  expect((await stored())?.session).toEqual(session);
  expect(loadWorkspaceNodeDocument(next)?.content).toBe(`Body ${next}`);
  expect(bodyReads(reads.mock.calls)).toHaveLength(1);
});

it('rejects a prepared body after a real persisted edit and loads the new version normally', async () => {
  await openDesktopDailyFlow({ now, mode: 'reading-only' });
  await vi.advanceTimersByTimeAsync(16);
  const next = openDatabaseConnection().driver.queryAll<{ node_id: string }>('SELECT node_id FROM daily_flow_entries ORDER BY order_key')[1]!.node_id;
  seed(next, 'Changed body');
  expect(loadWorkspaceNodeDocument(next)?.content).toBe('Changed body');
});

it.each(['pending', 'failed'] as const)('returns the committed current and accepts another action while future qualification is %s', async failure => {
  const first = await openDesktopDailyFlow({ now, mode: 'reading-only' });
  await vi.advanceTimersByTimeAsync(16);
  const second = await soon(first.session, 'soon-a');
  const b = second.session.currentNodeId!;
  const original = snapshots.withRequestSyncReadonlySnapshot;
  let entered = false;
  vi.spyOn(snapshots, 'withRequestSyncReadonlySnapshot').mockImplementation(<T,>(file: string, task: (db: DbPort) => Promise<T>, signal?: AbortSignal) =>
    original(file, db => task({ ...db, async query(sql, params) {
      if (sql.includes('order_key > ?')) {
        entered = true;
        if (failure === 'failed') throw new Error('future preparation failed');
        await new Promise<void>((_resolve, reject) => {
          if (signal?.aborted) reject(signal.reason);
          else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return db.query(sql, params);
    } }), signal));
  await vi.advanceTimersByTimeAsync(16);
  expect(entered).toBe(true);
  expect(loadWorkspaceNodeDocument(b)?.content).toBe(`Body ${b}`);
  expect((await stored())?.session.currentNodeId).toBe(b);
  const third = await soon(second.session, 'soon-b');
  expect(third.session.currentNodeId).not.toBe(b);
  expect((await stored())?.session).toEqual(third.session);
});

it('retires prepared documents when the database lifetime ends', async () => {
  await openDesktopDailyFlow({ now, mode: 'reading-only' });
  await vi.advanceTimersByTimeAsync(16);
  const next = openDatabaseConnection().driver.queryAll<{ node_id: string }>('SELECT node_id FROM daily_flow_entries ORDER BY order_key')[1]!.node_id;
  closeDatabaseConnection();
  initializeDatabase();
  const reads = vi.spyOn(openDatabaseConnection().driver, 'queryOne');
  expect(loadWorkspaceNodeDocument(next)?.content).toBe(`Body ${next}`);
  expect(bodyReads(reads.mock.calls)).toHaveLength(1);
});

it('uses the normal reader while a real edit still awaits its version flush', async () => {
  await openDesktopDailyFlow({ now, mode: 'reading-only' });
  await vi.advanceTimersByTimeAsync(16);
  const next = openDatabaseConnection().driver.queryAll<{ node_id: string }>('SELECT node_id FROM daily_flow_entries ORDER BY order_key')[1]!.node_id;
  seed(next, 'Pending version body', false);
  expect(loadWorkspaceNodeDocument(next)?.content).toBe('Pending version body');
});
