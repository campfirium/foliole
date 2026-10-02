// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const state = vi.hoisted(() => ({ connectionReady: true }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: (mode = 'relay') => mode === 'relay',
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return {
    isStoredReadwiseApiConnectionReady: () => state.connectionReady,
    loadStoredReadwiseHostSettings: () => ({
      apiConnection: { secretRef: 'readwise-secret', state: 'connected' },
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
      readwiseSourceMode: 'folder'
    })
  };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { writeReadwiseApiSourceDisposition } from '../database/readwiseApiSourceDispositions.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { apiSettings } from './readwiseApiImportRun.testSupport.js';
import { commitCutoverItem } from './readwiseCutoverCommit.js';
import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { promoteReadwiseSourceCutoverCohort } from './readwiseSourceCutoverJournal.js';
import { restartIncompleteReadwiseSourceCutover } from './readwiseSourceCutoverReset.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-restored-library-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  state.connectionReady = true;
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('readwise_source_mode','{\"mode\":\"relay\",\"version\":1}','old')"
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});


it.each([false, true])('waits for database ownership before committing a cutover item (busy=%s)', async (busy) => {
  const source = ensureReadwiseRemoteSource();
  restartIncompleteReadwiseSourceCutover({ connectionRef: source.connectionRef,
    sourceHost: 'This Mac', startedAt: new Date().toISOString() });
  const reader = normalizeReaderDocument({
    id: 'diagnostic', category: 'article', title: 'Diagnostic', html_content: '<p>Body</p>'
  });
  if (!reader) throw new Error('invalid fixture');
  const [document] = prepareReadwiseApiDocuments([reader], []);
  if (!document) throw new Error('missing fixture');
  promoteReadwiseSourceCutoverCohort([document.id]);
  writeReadwiseApiSourceDisposition(openDatabaseConnection().driver, source.connectionRef,
    document.id, document.title, 'hard_deleted', 'now');
  let release!: () => void;
  const owner = busy ? runWithDatabaseConnectionOwner(() => new Promise<void>((resolve) => { release = resolve; })) : null;
  const stages: string[] = [];
  const operation = commitCutoverItem({
    assertEligible: () => {}, connectionRef: source.connectionRef, dependencies: {}, document,
    item: { binding: null, destination: 'inbox', remoteId: document.id },
    settings: apiSettings('inbox'), onStage: (stage) => { stages.push(stage); }
  });
  try {
    if (busy) {
      await Promise.resolve();
      expect(stages).toEqual([]);
    }
  } finally {
    if (owner) { release(); await owner; }
  }
  await expect(operation).resolves.toBeUndefined();
  expect(loadReadwiseSourceCutover()).toMatchObject({ documents: [
    { remoteId: document.id, status: 'suppressed' }
  ] });
});

it('waits for a database owner before starting the migration pipeline', async () => {
  let release!: () => void;
  const owner = runWithDatabaseConnectionOwner(() => new Promise<void>((resolve) => { release = resolve; }));
  const fetchImpl = vi.fn(async () => Response.json({ count: 0, nextPageCursor: null, results: [] }));
  const operation = runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } });
  try {
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();
  } finally {
    release();
    await owner;
  }
  await expect(operation).resolves.toMatchObject({ status: 'completed' });
});

it('waits for a database owner acquired while a downloaded page is in flight', async () => {
  let deliver!: () => void;
  let requested!: () => void;
  const responseGate = new Promise<void>((resolve) => { deliver = resolve; });
  const requestedGate = new Promise<void>((resolve) => { requested = resolve; });
  let first = true;
  const operation = runReadwiseSourceCutover({ dependencies: { minIntervalMs: 0,
    fetchImpl: async () => {
      if (first) { first = false; requested(); await responseGate; }
      return Response.json({ count: 0, nextPageCursor: null, results: [] });
    }
  } });
  await requestedGate;
  let release!: () => void;
  const owner = runWithDatabaseConnectionOwner(() => new Promise<void>((resolve) => { release = resolve; }));
  let completed = false;
  const observed = operation.then((result) => { completed = true; return result; });
  try {
    deliver();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(completed).toBe(false);
  } finally {
    release();
    await owner;
  }
  await expect(observed).resolves.toMatchObject({ status: 'completed' });
});
