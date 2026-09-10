import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT = path.resolve('.tmp/artifacts/desktop-acceptance/t178-14-readwise-api-run-state.png');

async function installFixture(app: ElectronApplication) {
  await app.evaluate(({ clipboard }) => {
    const state = globalThis as typeof globalThis & { __t178Fetched?: string[] };
    state.__t178Fetched = [];
    state.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      const id = url.searchParams.get('id');
      if (id) {
        state.__t178Fetched?.push(id);
        return Response.json({ nextPageCursor: null, results: [{
          category: 'article', html_content: `<p>${id}</p>`, id, title: id,
          updated_at: '2026-09-10T00:00:00.000Z'
        }] });
      }
      return Response.json({ nextPageCursor: null, results: [] });
    };
    clipboard.writeText('t178-14-token');
  });
}

async function setupConnection(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const hostSettings = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseHostSettings.js'));
    const remoteIdentity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const source = remoteIdentity.createReadwiseRemoteSource('2026-09-10T00:00:00.000Z');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000014.bin';
      const defaults = hostSettings.createDefaultReadwiseHostSettings();
      secret.writeReadwiseApiSecret(secretRef, 't178-14-token');
      remoteIdentity.saveReadwiseConnectionState({
        ...defaults,
        apiConnection: { secretRef, state: 'connected', verifiedAt: '2026-09-10T00:00:00.000Z' },
        readwiseReaderConfig: defaults.readwiseReaderConfig,
        readwiseSourceMode: 'api', updatedAt: '2026-09-10T00:00:00.000Z'
      }, source, '2026-09-10T00:00:00.000Z');
      cutover.writeLegacyReadwiseSourceCutover({
        completedAt: '2026-09-10T00:00:00.000Z', completedCandidateCount: 31,
        migratedCount: 30, sourceHost: 'Test host', startedAt: '2026-09-10T00:00:00.000Z',
        status: 'api', totalCandidateCount: 31, unmatchedCount: 1
      });
    });
  });
}

async function seedInterruptedManifest(app: ElectronApplication) {
  return app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const source = settings.loadJsonSetting('readwise_remote_source');
      const driver = connection.openDatabaseConnection().driver;
      driver.execute('DELETE FROM readwise_api_import_stage WHERE connection_ref=?', [source.connectionRef]);
      driver.execute('DELETE FROM readwise_api_import_runs WHERE connection_ref=?', [source.connectionRef]);
      const insert = driver.prepare(`INSERT INTO readwise_api_import_stage
        (connection_ref, record_kind, remote_id, payload_json) VALUES (?, ?, ?, ?)`);
      insert.run([source.connectionRef, 'candidate-manifest-v2', 'manifest', JSON.stringify({
        pipelineVersion: 2,
        scopeSignature: JSON.stringify({ withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'inbox' })
      })]);
      for (let index = 1; index <= 31; index += 1) {
        const documentId = `candidate-${index}`;
        insert.run([source.connectionRef, 'candidate-v2', documentId, JSON.stringify({
          destination: 'inbox', documentId, exportCategory: null,
          ...(index > 29 ? { failure: {
            attemptCount: 1, failedAt: '2026-09-10T00:00:00.000Z', reason: null, stage: 'fetching'
          } } : {}),
          hasHighlights: false, highlightIds: [], readerCategory: 'article',
          status: index > 29 ? 'failed' : 'completed', title: documentId
        })]);
      }
      driver.execute(`INSERT INTO readwise_api_import_runs
        (connection_ref, query_updated_after, round_started_at, reader_cursor, export_cursor, phase, updated_at)
        VALUES (?, NULL, ?, NULL, NULL, 'candidate-v2:ready', ?)`,
      [source.connectionRef, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z']);
      settings.saveJsonSetting('readwise_api_import_state', { connectionRef: source.connectionRef, version: 1 });
      settings.saveJsonSetting('readwise_active_host', { host_name: 'Inactive test host' });
      settings.saveJsonSetting('readwise_api_schedule_state', {
        connectionRef: source.connectionRef, initialProgress: null, lastResult: null,
        lifecycle: {
          error_reason: null, finished_at: null, kind: 'initial',
          progress: { completed_count: 29, failed_count: 2, pending_count: 0,
            total_count: 31, unexplained_failure_count: 2 },
          queued_at: '2026-09-10T00:00:00.000Z', run_id: 'abandoned-worker',
          stage: 'writing', started_at: '2026-09-10T00:00:01.000Z', status: 'running', trigger: 'startup'
        }, nextRunAt: null, version: 2
      });
      return source.connectionRef;
    });
  });
}

async function inspectState(app: ElectronApplication) {
  return app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const scheduler = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiScheduler.js'));
    return connection.runWithDatabaseConnectionOwner(() => ({
      fetched: (globalThis as typeof globalThis & { __t178Fetched?: string[] }).__t178Fetched ?? [],
      status: scheduler.loadReadwiseApiScheduleStatus()
    }));
  });
}

async function activateAndResume(app: ElectronApplication) {
  await app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const apiImport = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiImportRun.js'));
    const scheduler = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiScheduler.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      scheduler.refreshReadwiseApiScheduler();
    });
    await apiImport.runReadwiseApiImport({
      dependencies: { fetchImpl: globalThis.fetch }, trigger: 'startup'
    });
  });
}

test('recovers an abandoned worker and retries only two failed candidates', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-14-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await installFixture(session.electronApp);
    await expectWorkspaceShell(session.firstWindow);
    await setupConnection(session.electronApp);
    await seedInterruptedManifest(session.electronApp);

    const closed = session.electronApp.waitForEvent('close');
    session.electronApp.process()?.kill('SIGKILL');
    await closed;
    await session.close().catch(() => undefined);
    session = await createT178ApiAcceptanceSession(stateRoot);
    await installFixture(session.electronApp);
    await expectWorkspaceShell(session.firstWindow);
    expect((await inspectState(session.electronApp)).status.initial_sync.status).toBe('interrupted');

    await activateAndResume(session.electronApp);
    await expect.poll(() => inspectState(session!.electronApp)).toMatchObject({
      fetched: ['candidate-30', 'candidate-31'],
      status: {
        cutover: { completed_count: 31, status: 'completed', total_count: 31 },
        initial_sync: { completed_count: 31, failed_count: 0, status: 'completed', total_count: 31 }
      }
    });
    const resumedSettings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(resumedSettings.getByRole('button', { name: /^(Sync|同步)$/ })).toBeVisible();
    await expect(resumedSettings.getByText(/^(Migration:|迁移：)/)).toHaveCount(0);
    await expect(resumedSettings.getByText(/^(First sync:|首次同步：)/)).toHaveCount(0);
    await mkdir(path.dirname(ARTIFACT), { recursive: true });
    await resumedSettings.screenshot({ path: ARTIFACT });
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
