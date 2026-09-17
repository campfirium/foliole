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

async function setRendererOnline(session: T178AcceptanceSession) {
  const setOnline = () => Object.defineProperty(navigator, 'onLine', {
    configurable: true, value: true
  });
  await session.firstWindow.addInitScript(setOnline);
  await session.firstWindow.evaluate(setOnline);
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

async function expectCompletedMigration(session: T178AcceptanceSession) {
  await expect.poll(() => session.firstWindow.evaluate(async () => {
    const [preview, settings] = await Promise.all([
      window.electronAPI.invoke('preview_readwise_source_cutover'),
      window.electronAPI.invoke('load_import_manager_settings')
    ]);
    return { mode: settings.readwiseSourceMode, status: preview.status };
  }), { timeout: 30_000 }).toEqual({ mode: 'api', status: 'already_completed' });
  await expectWorkspaceShell(session.firstWindow);
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
    connection: expect.objectContaining({ has_credential: true }),
    cutover: expect.objectContaining({ completed_count: 0, status: 'already_completed' })
  }));
}

async function pause(session: T178AcceptanceSession) {
  await session.electronApp.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __t17819Reject?: () => void };
    runtime.fetch = async () => { throw new Error('t178_19_stopped'); };
    runtime.__t17819Reject?.();
  });
}

test('restores the credential and completes a pending migration after startup', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-19-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedIncompleteMigration(session.electronApp);
    await setRendererOnline(session);
    await session.firstWindow.reload();
    await expectCompletedMigration(session);
    await expectStorageResponsive(session);
    await session.close();

    session = await createT178ApiAcceptanceSession(stateRoot);
    await setRendererOnline(session);
    await expectCompletedMigration(session);
    await expectStorageResponsive(session);
  } finally {
    if (session) await pause(session).catch(() => undefined);
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test('keeps API preparation selected after navigating away', async ({ browserName }) => {
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
    await expect(confirmation.getByText(/^(When everything looks right, select “Enable API mode” at the bottom of the page\. Foliole will then start syncing Readwise\.|确认无误后，在页面底部点击“启用 API 模式”。启用后，Foliole 将开始同步 Readwise。)$/)).toBeVisible();
    await confirmation.screenshot({ path: path.join(ARTIFACT_DIR, 'api-mode-setup-dialog.png') });
    await confirmation.getByRole('button', { name: /^(Continue setup|继续设置)$/ }).click();
    await expect(settings.getByText(/^(Not enabled yet|尚未启用)/)).toBeVisible();
    await expect(settings.getByRole('heading', { name: /^(Import rules|导入规则)$/ })).toBeVisible();
    await expect(settings.getByText(/^#$/)).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'api-mode-preparation.png') });
    const migrationButton = settings.getByRole('button', {
      name: /^(Enable API mode…|启用 API 模式…)$/
    });
    await migrationButton.scrollIntoViewIfNeeded();
    await expect(settings.getByText(/^(You can adjust the import rules after enabling it\.|启用后仍可调整导入规则。)$/)).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'api-mode-migration-action.png') });
    await migrationButton.click();
    await expect(session.firstWindow.getByRole('dialog', {
      name: /^(Enable API mode|启用 API 模式)$/
    })).toHaveCount(0);
    await expect(settings.getByRole('status')).toContainText(/^(Syncing · Downloading|正在同步 · 下载中)/);
    await expect(settings.getByRole('radio', { name: /^(API mode|API 模式)$/ })).toBeChecked();

    await openSettingsCategory(session.firstWindow, 'Appearance');
    settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByRole('radio', { name: /^(API mode|API 模式)$/ })).toBeChecked();
    await expect(settings.getByRole('radio', {
      name: /^(Obsidian relay|Obsidian 中转)$/
    })).not.toBeChecked();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'api-mode-after-return.png') });
    await pause(session);
  } finally {
    if (session) await pause(session).catch(() => undefined);
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
