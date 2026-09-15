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

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t178-19-source-mode');

async function seedIncompleteMigration(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const importSettings = require(pathApi.join(process.cwd(), 'dist/electron/import/importManagerSettings.js'));
    const reset = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseSourceCutoverReset.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const assignment = host.loadReadwiseHostAssignment();
      const source = identity.createReadwiseRemoteSource('2026-09-10T00:00:00.000Z');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000019.bin';
      secret.writeReadwiseApiSecret(secretRef, 't178-19-token');
      identity.saveReadwiseConnectionState({
        secretRef, state: 'connected', verifiedAt: '2026-09-10T00:00:00.000Z'
      }, source, '2026-09-10T00:00:00.000Z');
      reset.restartIncompleteReadwiseSourceCutover({
        connectionRef: source.connectionRef,
        policy: importSettings.loadImportManagerSettings().readwiseAutoImportPolicy,
        sourceHost: assignment.current_host_name,
        startedAt: '2026-09-10T00:00:00.000Z'
      });
    });
  });
}

async function installBlockedTransport(app: ElectronApplication) {
  await app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __t17819Requested?: boolean };
    runtime.__t17819Requested = false;
    runtime.fetch = async () => {
      runtime.__t17819Requested = true;
      throw new Error('t178_19_pause');
    };
  });
}

async function seedConnectedFolderMode(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const source = identity.createReadwiseRemoteSource('2026-09-14T00:00:00.000Z');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000914.bin';
      secret.writeReadwiseApiSecret(secretRef, 't178-19-source-mode-token');
      identity.saveReadwiseConnectionState({
        secretRef, state: 'connected', verifiedAt: '2026-09-14T00:00:00.000Z'
      }, source, '2026-09-14T00:00:00.000Z');
    });
  });
}

async function expectStableFailure(session: T178AcceptanceSession) {
  await expectWorkspaceShell(session.firstWindow);
  const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
  await expect(settings.getByText(/^(Connected|已连接)$/)).toBeVisible();
  await expect(settings.getByRole('status').filter({
    hasText: /^(Migrating · Indexing failed|正在迁移 · 索引失败)/
  })).toBeVisible();
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
    cutover: expect.objectContaining({ completed_count: 0, status: 'migration_in_progress' })
  }));
}

async function pause(session: T178AcceptanceSession) {
  await session.electronApp.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __t17819Reject?: () => void };
    runtime.fetch = async () => { throw new Error('t178_19_stopped'); };
    runtime.__t17819Reject?.();
  });
}

test('restores the credential, records failure, and does not retry it on restart', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-19-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedIncompleteMigration(session.electronApp);
    await installBlockedTransport(session.electronApp);
    await session.firstWindow.reload();
    await expectStableFailure(session);
    await expectStorageResponsive(session);
    await session.close();

    session = await createT178ApiAcceptanceSession(stateRoot);
    await installBlockedTransport(session.electronApp);
    await expectWorkspaceShell(session.firstWindow);
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByText(/^(Connected|已连接)$/)).toBeVisible();
    await expect(settings.getByRole('status').filter({
      hasText: /^(Migrating · Indexing failed|正在迁移 · 索引失败)/
    })).toBeVisible();
    expect(await session.electronApp.evaluate(() => Boolean(
      (globalThis as typeof globalThis & { __t17819Requested?: boolean }).__t17819Requested
    ))).toBe(false);
    await expectStorageResponsive(session);
  } finally {
    if (session) await pause(session).catch(() => undefined);
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test('keeps API preparation selected after navigating away from a failed migration', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-19-mode-'));
  let session: T178AcceptanceSession | null = null;
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedConnectedFolderMode(session.electronApp);
    await installBlockedTransport(session.electronApp);
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    let settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await settings.getByRole('radio', { name: /^(API mode|API 模式)$/ }).click();
    let confirmation = session.firstWindow.getByRole('dialog', {
      name: /^(Set up API mode|设置 API 模式)$/
    });
    await confirmation.getByRole('button', { name: /^(Continue setup|继续设置)$/ }).click();
    await expect(settings.getByText(/^(Not enabled yet|尚未启用)/)).toBeVisible();
    await expect(settings.getByRole('heading', { name: /^(Import rules|导入规则)$/ })).toBeVisible();
    await expect(settings.getByText(/^#$/)).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'api-mode-preparation.png') });
    const migrationButton = settings.getByRole('button', {
      name: /^(Migrate to API mode…|迁移到 API 模式…)$/
    });
    await migrationButton.scrollIntoViewIfNeeded();
    await expect(settings.getByText(/^(You can adjust the import rules after migration\.|迁移后仍可调整导入规则。)$/)).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'api-mode-migration-action.png') });
    await migrationButton.click();
    confirmation = session.firstWindow.getByRole('dialog', {
      name: /^(Switch to API mode|切换到 API 模式)$/
    });
    await confirmation.getByRole('button', { name: /^(Switch and migrate|切换并迁移)$/ }).click();
    await expect(settings.getByRole('radio', { name: /^(API mode|API 模式)$/ })).toBeChecked();
    await expect(settings.getByText(/^(Migrating · Indexing failed|正在迁移 · 索引失败)/)).toBeVisible();

    await openSettingsCategory(session.firstWindow, 'Appearance');
    settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByRole('radio', { name: /^(API mode|API 模式)$/ })).toBeChecked();
    await expect(settings.getByRole('radio', {
      name: /^(Obsidian relay import|Obsidian 中转导入模式)$/
    })).not.toBeChecked();
    await expect(settings.getByText(/^(Migrating · Indexing failed|正在迁移 · 索引失败)/)).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'api-mode-after-return.png') });
    await pause(session);
  } finally {
    if (session) await pause(session).catch(() => undefined);
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
