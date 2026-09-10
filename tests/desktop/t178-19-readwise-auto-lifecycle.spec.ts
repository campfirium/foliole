import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

async function seedIncompleteMigration(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const hostSettings = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseHostSettings.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const assignment = host.loadReadwiseHostAssignment();
      const source = identity.createReadwiseRemoteSource('2026-09-10T00:00:00.000Z');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000019.bin';
      const defaults = hostSettings.createDefaultReadwiseHostSettings();
      secret.writeReadwiseApiSecret(secretRef, 't178-19-token');
      identity.saveReadwiseConnectionState({
        ...defaults,
        apiConnection: { secretRef, state: 'connected', verifiedAt: '2026-09-10T00:00:00.000Z' },
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

async function installBlockedTransport(app: ElectronApplication) {
  await app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & {
      __t17819Requested?: boolean;
      __t17819Reject?: () => void;
    };
    runtime.__t17819Requested = false;
    runtime.fetch = async () => {
      runtime.__t17819Requested = true;
      return new Promise((_resolve, reject) => {
        runtime.__t17819Reject = () => reject(new Error('t178_19_pause'));
      });
    };
  });
}

async function expectAutomaticRun(session: T178AcceptanceSession) {
  await expectWorkspaceShell(session.firstWindow);
  const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
  await expect(settings.getByText(/^(Connected|已连接)$/)).toBeVisible();
  await expect(settings.getByRole('button', {
    name: /^(Migrating to API mode 22%|正在迁移到 API 模式 22%)$/
  })).toBeVisible();
  await expect.poll(() => session.electronApp.evaluate(() => Boolean(
    (globalThis as typeof globalThis & { __t17819Requested?: boolean }).__t17819Requested
  ))).toBe(true);
  return settings;
}

async function expectStorageResponsive(session: T178AcceptanceSession) {
  const result = await session.firstWindow.evaluate(async () => Promise.race([
    Promise.all([
      window.electronAPI.invoke('load_readwise_api_connection'),
      window.electronAPI.invoke('preview_readwise_source_cutover'),
      window.electronAPI.invoke('load_workspace_list_snapshot')
    ]).then(([connection, cutover]) => ({ connection, cutover })),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 2_000))
  ]));
  expect(result).toEqual(expect.objectContaining({
    connection: expect.objectContaining({ has_credential: true, state: 'connected' }),
    cutover: expect.objectContaining({ completed_count: 7, status: 'migration_in_progress' })
  }));
}

async function pause(session: T178AcceptanceSession) {
  await session.electronApp.evaluate(() => {
    (globalThis as typeof globalThis & { __t17819Reject?: () => void }).__t17819Reject?.();
  });
}

test('restores the credential and auto-resumes cutover without owning network wait', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-19-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedIncompleteMigration(session.electronApp);
    await installBlockedTransport(session.electronApp);
    await session.firstWindow.reload();
    await expectAutomaticRun(session);
    await expectStorageResponsive(session);
    await pause(session);
    await session.close();

    session = await createT178ApiAcceptanceSession(stateRoot);
    await installBlockedTransport(session.electronApp);
    await expectAutomaticRun(session);
    await expectStorageResponsive(session);
    await pause(session);
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
