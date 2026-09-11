import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t178-21');

async function seedCompletedApiMode(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const hostSettings = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseHostSettings.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const assignment = host.loadReadwiseHostAssignment();
      const source = identity.createReadwiseRemoteSource('2026-09-12T00:00:00.000Z');
      identity.saveReadwiseConnectionState({
        ...hostSettings.createDefaultReadwiseHostSettings(),
        apiConnection: { secretRef: null, state: 'disconnected', verifiedAt: null },
        readwiseSourceMode: 'api',
        updatedAt: '2026-09-12T00:00:00.000Z'
      }, source, '2026-09-12T00:00:00.000Z');
      cutover.writeReadwiseSourceCutover({
        annotations: [], cohortDocumentIds: [],
        completedAt: '2026-09-12T00:00:00.000Z', documents: [], retiredNodeIds: [],
        sourceHost: assignment.current_host_name, startedAt: '2026-09-12T00:00:00.000Z', status: 'api'
      });
    });
  });
}

async function expectSameSize(buttons: Locator[]) {
  const boxes = await Promise.all(buttons.map(async (button) => {
    await expect(button).toBeVisible();
    return button.boundingBox();
  }));
  expect(boxes.every(Boolean)).toBe(true);
  const sizes = boxes.map((box) => `${box!.width}x${box!.height}`);
  expect(new Set(sizes).size).toBe(1);
}

async function capture(settings: Locator, testInfo: TestInfo, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, `${name}.png`);
  await settings.screenshot({ path: target });
  await testInfo.attach(name, { contentType: 'image/png', path: target });
}

test('keeps Readwise row actions fixed across folder and API modes', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-21-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await expectWorkspaceShell(session.firstWindow);
    let settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    const folderRows = settings.getByLabel(/^(Readwise Reader import|Readwise Reader 导入)$/, { exact: true });
    await expectSameSize([
      folderRows.getByRole('button', { name: /^(Sync|同步)$/ }),
      folderRows.getByRole('button', { name: /^(Clean up…|清理…|Clean up\.\.\.|清理\.\.\.)$/ })
    ]);
    await expect(settings.getByRole('combobox', { name: /^(Sync frequency|同步频率)$/ }))
      .not.toHaveClass(/w-36/);
    await capture(settings, testInfo, 'folder-actions');

    await seedCompletedApiMode(session.electronApp);
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    const apiRows = settings.getByLabel(/^(Source|来源)$/, { exact: true });
    await expectSameSize([
      apiRows.getByRole('button', { name: /^(Connect Readwise|连接 Readwise)$/ }),
      apiRows.getByRole('button', { name: /^(Sync|同步)$/ }),
      apiRows.getByRole('button', { name: /^(Clean up…|清理…|Clean up\.\.\.|清理\.\.\.)$/ })
    ]);
    await expect(settings.getByRole('radiogroup', {
      name: /^(Readwise source mode|Readwise 来源模式)$/
    })).not.toHaveClass(/w-36/);
    await capture(settings, testInfo, 'api-actions');
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
