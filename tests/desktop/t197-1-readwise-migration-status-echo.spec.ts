import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  seedCompletedReadwiseApiMode,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t197-1');

async function seedConnectedApi(app: ElectronApplication, migrating: boolean) {
  await app.evaluate((_electron, shouldMigrate) => {
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
      const sourceHost = host.loadReadwiseHostAssignment().current_host_name;
      const source = identity.loadReadwiseRemoteSource()
        ?? identity.createReadwiseRemoteSource('2026-09-15T00:00:00.000Z');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000197.bin';
      secret.writeReadwiseApiSecret(secretRef, 't197-1-token');
      identity.saveReadwiseConnectionState({
        secretRef, state: 'connected', verifiedAt: '2026-09-15T00:00:00.000Z'
      }, source, '2026-09-15T00:00:00.000Z');
      if (shouldMigrate) {
        cutover.writeReadwiseSourceCutover({
          annotations: [], cohortDocumentIds: ['document-1'],
          completedAt: '2026-09-15T00:00:00.000Z', documents: [], phase: 'merging',
          retiredNodeIds: [], sourceHost, startedAt: '2026-09-15T00:00:00.000Z',
          status: 'migration-in-progress'
        });
      }
    });
  }, migrating);
}

async function seedCompletedFailure(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    const cutoverContract = require(pathApi.join(
      process.cwd(), 'dist/lib/core/readwise/readwiseSourceCutover.js'
    ));
    connection.runWithDatabaseConnectionOwner(() => {
      const sourceHost = host.loadReadwiseHostAssignment().current_host_name;
      cutover.writeReadwiseSourceCutover({
        annotations: [], cohortDocumentIds: ['failed-epub'],
        completedAt: '2026-09-15T00:00:01.000Z',
        completionVersion: cutoverContract.READWISE_SOURCE_CUTOVER_COMPLETION_VERSION,
        documents: [{
          nodeId: null, reason: 'original_file_download_failed',
          remoteId: 'failed-epub', status: 'unavailable'
        }],
        failures: [{
          reason: 'original_file_download_failed', remoteId: 'failed-epub',
          stage: 'resources', title: 'Broken EPUB'
        }],
        retiredNodeIds: [], sourceHost, startedAt: '2026-09-15T00:00:00.000Z', status: 'api'
      });
    });
  });
}

async function openReadwise(session: T178AcceptanceSession) {
  await expectWorkspaceShell(session.firstWindow);
  await openSettingsCategory(session.firstWindow, 'Appearance');
  return openSettingsCategory(session.firstWindow, 'ReadwiseReader');
}

async function captureConnection(section: Locator, testInfo: TestInfo, name: string) {
  await section.scrollIntoViewIfNeeded();
  const target = path.join(ARTIFACT_DIR, `${name}.png`);
  await section.screenshot({ path: target });
  await testInfo.attach(name, { contentType: 'image/png', path: target });
}

test('echoes the active migration below the connection and removes it on completion', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const activeStateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t197-1-active-'));
  const completedStateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t197-1-completed-'));
  let session: T178AcceptanceSession | null = null;
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    session = await createT178ApiAcceptanceSession(activeStateRoot);

    await seedConnectedApi(session.electronApp, true);
    let settings = await openReadwise(session);
    let connection = settings.getByLabel(/^(API connection|API 连接)$/);
    await expect(connection.getByText(/^(Connected|已连接)$/)).toBeVisible();
    await expect(connection.getByText(/^(Syncing · Importing|正在同步 · 导入中)$/)).toBeVisible();
    await expect(connection.getByRole('button', { name: /^(Disconnect|断开)$/ })).toBeVisible();
    await captureConnection(connection, testInfo, 'migration-indexing-echo');

    await session.close();
    session = null;
    session = await createT178ApiAcceptanceSession(completedStateRoot);
    await seedConnectedApi(session.electronApp, false);
    await seedCompletedReadwiseApiMode(session.electronApp, '2026-09-15T00:00:01.000Z');
    await seedCompletedFailure(session.electronApp);
    await session.firstWindow.reload();
    settings = await openReadwise(session);
    connection = settings.getByLabel(/^(API connection|API 连接)$/);
    await expect(connection.getByText(/^(Connected|已连接)$/)).toBeVisible();
    await expect(connection.getByText(/^(Syncing · Importing|正在同步 · 导入中)$/)).toHaveCount(0);
    await expect(connection.getByRole('button', { name: /^(Disconnect|断开)$/ })).toBeVisible();
    const issues = settings.getByRole('region', { name: /^(Sync issues|同步问题)$/ });
    await expect(issues.getByText('Broken EPUB')).toBeVisible();
    await expect(issues).toContainText(/original_file_download_failed/);
    await captureConnection(connection, testInfo, 'migration-completed-echo-removed');
    await captureConnection(issues, testInfo, 'migration-failure-details');
    await captureConnection(settings, testInfo, 'migration-failure-settings');
  } finally {
    await session?.close().catch(() => undefined);
    await rm(activeStateRoot, { force: true, recursive: true });
    await rm(completedStateRoot, { force: true, recursive: true });
  }
});
