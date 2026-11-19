// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../database/readwiseRemoteIdentity.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../database/readwiseRemoteIdentity.js')>()),
  loadReadwiseRemoteSource: () => ({
    connectionRef: 'connection', createdAt: 'created', updatedAt: 'updated', version: 1
  })
}));
vi.mock('./readwiseApiConnectionState.js', () => ({
  loadStoredReadwiseHostSettings: () => ({
    apiConnection: { secretRef: 'readwise-api-00000000-0000-4000-8000-000000000001.bin', state: 'connected' },
    readwiseSourceMode: 'api'
  })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'SECRET' }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { openDesktopDailyFlow } from '../database/dailyFlow.js';
import { runDesktopDatabaseWrite } from '../database/desktopDatabaseWriteQueue.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { submitDesktopOperation } from '../desktopOperations.js';

import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import { apiSettings, readerDocument, response } from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-owner-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function holdDatabaseOwner() {
  let release!: () => void;
  let acquired!: () => void;
  const busy = new Promise<void>((resolve) => { release = resolve; });
  const holding = new Promise<void>((resolve) => { acquired = resolve; });
  const owner = runWithDatabaseConnectionOwner(async () => {
    acquired();
    await busy;
  });
  return { holding, owner, release };
}

it('waits for another asynchronous database owner before starting automatic import', async () => {
  const gate = holdDatabaseOwner();
  await gate.holding;
  const fetchImpl = vi.fn(async () => response([])) as typeof fetch;
  const importResult = runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off'), trigger: 'scheduled'
  });
  try {
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();
  } finally {
    gate.release();
    await gate.owner;
  }
  await expect(importResult).resolves.toMatchObject({ status: 'completed' });
});

it('waits for a database owner that starts while a Reader response is in flight', async () => {
  let gate: ReturnType<typeof holdDatabaseOwner> | null = null;
  let signalReady!: (value: ReturnType<typeof holdDatabaseOwner>) => void;
  const ready = new Promise<ReturnType<typeof holdDatabaseOwner>>((resolve) => { signalReady = resolve; });
  const fetchImpl = vi.fn(async () => {
    if (!gate) {
      gate = holdDatabaseOwner();
      signalReady(gate);
      await gate.holding;
    }
    return response([]);
  }) as typeof fetch;
  const importResult = runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off'), trigger: 'scheduled'
  });
  const activeGate = await ready;
  try {
    await activeGate.holding;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } finally {
    activeGate.release();
    await activeGate.owner;
  }
  await expect(importResult).resolves.toMatchObject({ status: 'completed' });
});

it('waits for a database owner that starts during a candidate body request', async () => {
  let signalReady!: (value: ReturnType<typeof holdDatabaseOwner>) => void;
  const ready = new Promise<ReturnType<typeof holdDatabaseOwner>>((resolve) => { signalReady = resolve; });
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.searchParams.get('id') === 'document') {
      const gate = holdDatabaseOwner();
      signalReady(gate);
      await gate.holding;
      return response([readerDocument('document', 'article', true)]);
    }
    if (url.searchParams.get('category') === 'article') {
      return response([readerDocument('document', 'article', false)]);
    }
    return response([]);
  }) as typeof fetch;
  const importResult = runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('inbox'), trigger: 'scheduled'
  });
  const activeGate = await ready;
  try {
    await activeGate.holding;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } finally {
    activeGate.release();
    await activeGate.owner;
  }
  await expect(importResult).resolves.toMatchObject({ committed_count: 1, status: 'completed' });
});

it('opens and persists Flow while the scheduled Readwise import waits for a body', async () => {
  const now = new Date().toISOString();
  upsertNodeSnapshot({
    nodeId: 'flow-topic', parentNodeId: null, kind: 'topic', title: 'Flow topic',
    content: 'A complete reading body', isTitleManual: true, reveal: null, anchorLink: null,
    position: 0, createdAt: now, updatedAt: now
  });
  let releaseBody!: () => void;
  const bodyResponse = new Promise<void>(resolve => { releaseBody = resolve; });
  let notifyBodyRequested!: () => void;
  const bodyRequested = new Promise<void>(resolve => { notifyBodyRequested = resolve; });
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.searchParams.get('id') === 'document') {
      notifyBodyRequested();
      await bodyResponse;
      return response([readerDocument('document', 'article')]);
    }
    return response(url.searchParams.get('category') === 'article'
      ? [readerDocument('document', 'article', false)] : []);
  }) as typeof fetch;
  const job = submitDesktopOperation('readwise-api-import', {
    run: () => runReadwiseApiImport({
      dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('inbox'), trigger: 'scheduled'
    })
  });
  let foreground: Promise<Awaited<ReturnType<typeof openDesktopDailyFlow>>> | undefined;
  try {
    await Promise.race([bodyRequested, job.promise.then(() => {
      throw new Error('Readwise finished before requesting the document body.');
    })]);
    let opened = false;
    foreground = runDesktopDatabaseWrite('foreground', () => openDesktopDailyFlow({
      now, mode: 'recommended'
    })).then(result => { opened = true; return result; });
    await expect.poll(() => opened, { timeout: 1500 }).toBe(true);
    expect((await foreground).session.currentNodeId).toBe('flow-topic');
    expect(await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.queryOne(
      'SELECT node_id FROM daily_flow_entries WHERE node_id = ?', ['flow-topic']
    ))).toEqual({ node_id: 'flow-topic' });
    releaseBody();
    await expect(job.promise).resolves.toMatchObject({ committed_count: 1, status: 'completed' });
    expect(await runWithDatabaseConnectionOwner(() => loadReadwiseApiImportSource(
      'connection', 'document'
    ))).toMatchObject({ nodeId: expect.any(String) });
    expect((await runDesktopDatabaseWrite('foreground', () => openDesktopDailyFlow({
      now, mode: 'recommended'
    }))).session.currentNodeId).toBe('flow-topic');
  } finally {
    releaseBody();
    await Promise.allSettled([job.promise, foreground]);
  }
});
