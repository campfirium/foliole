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
  migration: 'indexing' | 'merging';
};

async function seedProjection(app: ElectronApplication, projection: Projection) {
  await app.evaluate((_electron, input) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const assignment = host.loadReadwiseHostAssignment();
      const source = identity.loadReadwiseRemoteSource()
        ?? identity.createReadwiseRemoteSource('2026-09-11T00:00:00.000Z');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000020.bin';
      secret.writeReadwiseApiSecret(secretRef, 't178-20-token');
      identity.saveReadwiseConnectionState({
        secretRef, state: 'connected', verifiedAt: '2026-09-11T00:00:00.000Z'
      }, source, '2026-09-11T00:00:00.000Z');
      cutover.writeReadwiseSourceCutover({
        annotations: [], cohortDocumentIds: ['document-1'],
        completedAt: '2026-09-11T00:00:00.000Z', documents: [], phase: input.migration,
        retiredNodeIds: [], sourceHost: assignment.current_host_name,
        startedAt: '2026-09-11T00:00:00.000Z', status: 'migration-in-progress'
      });
    });
  }, projection);
}

async function reopenReadwise(session: T178AcceptanceSession) {
  await expectWorkspaceShell(session.firstWindow);
  await openSettingsCategory(session.firstWindow, 'Appearance');
  return openSettingsCategory(session.firstWindow, 'ReadwiseReader');
}

async function expectPhase(settings: Locator, expected: RegExp, screenshot: string) {
  const status = settings.getByRole('status').filter({ hasText: expected });
  await expect(status).toBeVisible();
  await expect(settings.getByRole('progressbar')).toHaveCount(0);
  await settings.screenshot({ path: path.join(ARTIFACT_DIR, screenshot) });
}

test('projects durable migration phases with truthful progress', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-20-'));
  let session: T178AcceptanceSession | null = null;
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    session = await createT178ApiAcceptanceSession(stateRoot);

    await seedProjection(session.electronApp, { migration: 'indexing' });
    let settings = await reopenReadwise(session);
    await expectPhase(settings, /^(Migrating · Indexing|正在迁移 · 索引中) · 0 \/ 1$/, 'migration-indexing.png');

    await seedProjection(session.electronApp, { migration: 'merging' });
    settings = await reopenReadwise(session);
    await expectPhase(settings, /^(Migrating · Merging|正在迁移 · 合并中) · 0 \/ 1$/, 'migration-merging.png');

  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
