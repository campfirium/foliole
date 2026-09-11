import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t178-20');

type Projection = {
  migration: 'completed' | 'indexing' | 'merging';
  sync?: { stage: 'fetching' | 'writing'; status: 'completed' | 'interrupted' };
};

async function seedProjection(app: ElectronApplication, projection: Projection) {
  await app.evaluate((_electron, input) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const hostSettings = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseHostSettings.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const assignment = host.loadReadwiseHostAssignment();
      const source = identity.loadReadwiseRemoteSource()
        ?? identity.createReadwiseRemoteSource('2026-09-11T00:00:00.000Z');
      const defaults = hostSettings.createDefaultReadwiseHostSettings();
      identity.saveReadwiseConnectionState({
        ...defaults,
        apiConnection: { secretRef: null, state: 'disconnected', verifiedAt: null },
        readwiseSourceMode: 'api',
        updatedAt: '2026-09-11T00:00:00.000Z'
      }, source, '2026-09-11T00:00:00.000Z');
      cutover.writeReadwiseSourceCutover({
        annotations: [],
        cohortDocumentIds: input.migration === 'merging' ? ['document-1'] : [],
        completedAt: '2026-09-11T00:00:00.000Z',
        documents: [],
        retiredNodeIds: [],
        sourceHost: assignment.current_host_name,
        startedAt: '2026-09-11T00:00:00.000Z',
        status: input.migration === 'completed' ? 'api' : 'migration-in-progress'
      });
      const lifecycle = input.sync ? {
        error_reason: null,
        finished_at: input.sync.status === 'completed' ? '2026-09-11T00:00:03.000Z' : null,
        kind: 'initial',
        progress: null,
        queued_at: '2026-09-11T00:00:01.000Z',
        run_id: 't178-20-run',
        stage: input.sync.stage,
        started_at: '2026-09-11T00:00:02.000Z',
        status: input.sync.status,
        trigger: 'manual'
      } : null;
      settings.saveJsonSetting('readwise_api_schedule_state', {
        connectionRef: source.connectionRef,
        initialProgress: null,
        lastResult: null,
        lifecycle,
        nextRunAt: null,
        version: 2
      });
    });
  }, projection);
}

async function reopenReadwise(session: T178AcceptanceSession) {
  await session.firstWindow.reload();
  await expectWorkspaceShell(session.firstWindow);
  return openSettingsCategory(session.firstWindow, 'ReadwiseReader');
}

async function expectPhase(settings: Locator, expected: RegExp, screenshot: string) {
  const status = settings.getByRole('status').filter({ hasText: expected });
  await expect(status).toBeVisible();
  await expect(status).not.toContainText(/[0-9%/]/u);
  await expect(settings.getByRole('progressbar')).toHaveCount(0);
  await settings.screenshot({ path: path.join(ARTIFACT_DIR, screenshot) });
}

test('projects durable migration and sync phases below the API source mode without numbers', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-20-'));
  let session: T178AcceptanceSession | null = null;
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    session = await createT178ApiAcceptanceSession(stateRoot);

    await seedProjection(session.electronApp, { migration: 'indexing' });
    let settings = await reopenReadwise(session);
    await expectPhase(settings, /^(Migrating · Indexing|正在迁移 · 索引中)$/, 'migration-indexing.png');

    await seedProjection(session.electronApp, { migration: 'merging' });
    settings = await reopenReadwise(session);
    await expectPhase(settings, /^(Migrating · Merging|正在迁移 · 合并中)$/, 'migration-merging.png');

    await seedProjection(session.electronApp, {
      migration: 'completed', sync: { stage: 'fetching', status: 'interrupted' }
    });
    settings = await reopenReadwise(session);
    await expectPhase(settings, /^(Indexing|索引中)$/, 'sync-indexing.png');

    await seedProjection(session.electronApp, {
      migration: 'completed', sync: { stage: 'writing', status: 'interrupted' }
    });
    settings = await reopenReadwise(session);
    await expectPhase(settings, /^(Syncing|同步中)$/, 'syncing.png');

    await seedProjection(session.electronApp, {
      migration: 'completed', sync: { stage: 'writing', status: 'completed' }
    });
    settings = await reopenReadwise(session);
    await expect(settings.getByText(/^(Indexing|索引中|Syncing|同步中)$/)).toHaveCount(0);
    await expect(settings.getByLabel(/^(Source|来源)$/, { exact: true })
      .getByRole('button', { name: /^(Sync|同步)$/ })).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'completed.png') });
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
