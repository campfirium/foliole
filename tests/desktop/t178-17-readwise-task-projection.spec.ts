import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t178-17');

async function seedMigration(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const hostSettings = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseHostSettings.js'));
    const remoteIdentity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    const runtime = globalThis as typeof globalThis & { __t17817Reject?: () => void };
    runtime.fetch = async () => new Promise((_resolve, reject) => {
      runtime.__t17817Reject = () => reject(new Error('t178_17_pause'));
    });
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const assignment = host.loadReadwiseHostAssignment();
      const source = remoteIdentity.createReadwiseRemoteSource('2026-09-10T00:00:00.000Z');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000017.bin';
      const defaults = hostSettings.createDefaultReadwiseHostSettings();
      secret.writeReadwiseApiSecret(secretRef, 't178-17-token');
      remoteIdentity.saveReadwiseConnectionState({
        ...defaults,
        apiConnection: { secretRef, state: 'connected', verifiedAt: '2026-09-10T00:00:00.000Z' },
        readwiseReaderConfig: defaults.readwiseReaderConfig,
        readwiseSourceMode: 'api',
        updatedAt: '2026-09-10T00:00:00.000Z'
      }, source, '2026-09-10T00:00:00.000Z');
      cutover.writeLegacyReadwiseSourceCutover({
        completedAt: '2026-09-10T00:00:00.000Z',
        completedCandidateCount: 7,
        migratedCount: 7,
        sourceHost: assignment.current_host_name,
        startedAt: '2026-09-10T00:00:00.000Z',
        status: 'migration-in-progress',
        totalCandidateCount: 31,
        unmatchedCount: 0
      });
    });
  });
}

async function finishMigration(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      connection.openDatabaseConnection().driver.execute(
        "DELETE FROM settings WHERE key='readwise_source_cutover_v2'"
      );
      cutover.writeLegacyReadwiseSourceCutover({
        completedAt: '2026-09-10T00:10:00.000Z',
        completedCandidateCount: 31,
        migratedCount: 30,
        sourceHost: 'Test host',
        startedAt: '2026-09-10T00:00:00.000Z',
        status: 'api',
        totalCandidateCount: 31,
        unmatchedCount: 1
      });
    });
  });
}

async function installWorkerFixture(app: ElectronApplication) {
  await app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & {
      __t17817Blocked?: boolean;
      __t17817Release?: () => void;
      __t17817Round?: number;
    };
    runtime.fetch = async (input) => {
      const url = new URL(String(input));
      const round = runtime.__t17817Round ?? 1;
      const id = url.searchParams.get('id');
      if (url.pathname === '/api/v2/export/') return Response.json({
        nextPageCursor: null,
        results: [1, 2].map((index) => ({
          category: 'articles', external_id: `round-${round}-document-${index}`,
          highlights: [{ external_id: `round-${round}-highlight-${index}`, text: `Body ${index}` }],
          source: 'reader'
        }))
      });
      if (url.searchParams.has('category')) return Response.json({ nextPageCursor: null, results: [] });
      if (id === `round-${round}-document-2` && url.searchParams.has('withHtmlContent')) {
        runtime.__t17817Blocked = true;
        await new Promise<void>((resolve) => { runtime.__t17817Release = resolve; });
      }
      const highlight = id?.includes('-highlight-');
      return Response.json({ nextPageCursor: null, results: highlight ? [{
        category: 'highlight', id, parent_id: id?.replace('-highlight-', '-document-')
      }] : [{
        category: 'article', html_content: `<p>${id}</p>`, id, title: id,
        updated_at: '2026-09-10T00:00:00.000Z'
      }] });
    };
  });
}

async function startWorker(app: ElectronApplication, round: number) {
  await app.evaluate(async (_electron, nextRound) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const apiImport = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiImportRun.js'));
    const runtime = globalThis as typeof globalThis & {
      __t17817Blocked?: boolean; __t17817Round?: number; __t17817Run?: Promise<unknown>;
    };
    runtime.__t17817Blocked = false;
    runtime.__t17817Round = nextRound;
    await connection.runWithDatabaseConnectionOwner(() => undefined);
    runtime.__t17817Run = apiImport.runReadwiseApiImport({
      dependencies: { fetchImpl: runtime.fetch, minIntervalMs: 0 }, trigger: 'manual'
    });
  }, round);
  await expect.poll(() => app.evaluate(() =>
    Boolean((globalThis as typeof globalThis & { __t17817Blocked?: boolean }).__t17817Blocked)
  )).toBe(true);
}

async function finishWorker(app: ElectronApplication) {
  await app.evaluate(async () => {
    const runtime = globalThis as typeof globalThis & {
      __t17817Release?: () => void; __t17817Run?: Promise<unknown>;
    };
    runtime.__t17817Release?.();
    await runtime.__t17817Run;
  });
}

test('shows only the current migration or owned sync worker state', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-17-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedMigration(session.electronApp);
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    let settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByRole('button', {
      name: /^(Migrating to API mode 22%|正在迁移到 API 模式 22%)$/
    })).toBeVisible();
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'migration-running.png') });

    await session.electronApp.evaluate(() => {
      (globalThis as typeof globalThis & { __t17817Reject?: () => void }).__t17817Reject?.();
    });
    await expect(settings.getByRole('button', {
      name: /^(Continue migrating to API mode 22%|继续迁移到 API 模式 22%)$/
    })).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'migration-paused.png') });

    await finishMigration(session.electronApp);
    await installWorkerFixture(session.electronApp);
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    const sourceControls = settings.getByLabel(/^(Source|来源)$/, { exact: true });
    await expect(settings.getByText(/^(Migration:|迁移：)/)).toHaveCount(0);
    await startWorker(session.electronApp, 1);
    await expect(sourceControls.getByRole('button', { name: /^(Syncing 1\/2|同步中 1\/2)$/ })).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'initial-running.png') });
    await finishWorker(session.electronApp);
    await expect(sourceControls.getByRole('button', { name: /^(Sync|同步)$/ })).toBeVisible();

    await startWorker(session.electronApp, 2);
    await expect(sourceControls.getByRole('button', { name: /^(Syncing 1\/2|同步中 1\/2)$/ })).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'routine-running.png') });
    await finishWorker(session.electronApp);
    await expect(sourceControls.getByRole('button', { name: /^(Sync|同步)$/ })).toBeVisible();
    await expect(settings.getByText(/^(First sync:|首次同步：|Routine sync:|日常同步：)/)).toHaveCount(0);
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'completed.png') });
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
