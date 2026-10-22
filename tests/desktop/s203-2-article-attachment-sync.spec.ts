import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

type ResourceFixture = { keys: string[]; requests: string[]; endpoint: string; peerDeviceId: string; remoteLibraryEpoch: string; healthy: boolean };
declare global {
  var __s203Batch: ResourceFixture & { server: import('node:http').Server };
}

async function startProvider(app: ElectronApplication) {
  return app.evaluate(async ({ nativeImage }) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const fixture = require(pathApi.join(process.cwd(), 'tests/desktop/harness/resourceProviderFixture.cjs'));
    globalThis.__s203Batch = await fixture.startResourceProvider(nativeImage);
    return { keys: globalThis.__s203Batch.keys, endpoint: globalThis.__s203Batch.endpoint };
  });
}

async function runBatch(app: ElectronApplication) {
  return app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const group = await connection.runWithDatabaseConnectionOwner(() =>
      require(pathApi.join(process.cwd(), 'dist/electron/database/syncGroupStore.js')).loadDesktopSyncGroup());
    const resources = require(pathApi.join(process.cwd(), 'dist/electron/sync/desktopRequestSyncResources.js'));
    const result = await resources.continueDesktopRequestSyncResources({ peer: { endpoint_url: globalThis.__s203Batch.endpoint,
      group_id: group.group_id, local_device_id: group.local_device_identity_key,
      peer_device_id: globalThis.__s203Batch.peerDeviceId },
      remoteLibraryEpoch: globalThis.__s203Batch.remoteLibraryEpoch });
    const resolver = require(pathApi.join(process.cwd(), 'dist/electron/attachments/resourceResolver.js'));
    return connection.runWithDatabaseConnectionOwner(async () => ({ ...result, requests: [...globalThis.__s203Batch.requests],
      files: (await Promise.all(globalThis.__s203Batch.keys.map((key) => resolver.resolveAttachmentFile(key))))
        .map((file: { status: string }) => file.status) }));
  });
}

test('fetches only current article files once and preserves bodies through 404 and disconnect', async ({ desktopApp, desktopWindow: page }) => {
  test.info().annotations.push({ type: 'calibrated-ms', description: String(180_000) });
  await expectWorkspaceShell(page);
  const settings = await openSettingsCategory(page, 'Sync');
  await settings.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ }).click();
  await expect(settings.getByRole('list', { name: /^(Devices|设备)$/ }).getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('Escape');
  const { keys } = await startProvider(desktopApp);
  const content = `# Batch article\n\n${keys.slice(0, 3).map((key, index) => `![Batch ${index}](asset://${key})`).join('\n\n')}`;
  try {
    await page.evaluate(async ({ content, keys }) => {
      await window.__folioleWorkspaceDebug?.seedNodes?.([
        { id: 's203-batch-a', kind: 'topic', title: 'Batch article', content },
        { id: 's203-batch-b', kind: 'topic', title: 'Shared article', content: `![Shared](asset://${keys[0]})` },
        { id: 's203-batch-other', kind: 'topic', title: 'Unrelated article', content: 'No current attachment reference' }
      ], { persist: true });
    }, { content, keys });
    await expect.poll(async () => (await loadNodeDocument(page, 's203-batch-a'))?.content).toBe(content);
    const first = await runBatch(desktopApp);
    expect(first.requests).toHaveLength(3);
    expect(new Set(first.requests).size).toBe(3);
    expect(first.pending).toBe(2);
    expect(first.transferred).toBe(1);
    expect(first.files).toEqual(['ready', 'missing_file', 'missing_file', 'missing_file']);
    expect((await loadNodeDocument(page, 's203-batch-a'))?.content).toBe(content);
    await desktopApp.evaluate(() => { globalThis.__s203Batch.healthy = true; });
    const retried = await runBatch(desktopApp);
    expect(retried.pending).toBe(0);
    expect(retried.transferred).toBe(2);
    expect(retried.files).toEqual(['ready', 'ready', 'ready', 'missing_file']);
    const complete = await runBatch(desktopApp);
    expect(complete.transferred).toBe(0);
    expect(complete.pending).toBe(0);
    expect(complete.requests).toEqual(retried.requests);
    expect((await loadNodeDocument(page, 's203-batch-a'))?.content).toBe(content);
    expect(retried.requests).toHaveLength(5);
    expect(retried.requests.filter((id: string) => id === keys[0]!.slice(0, 64))).toHaveLength(1);
    await page.evaluate(() => window.__folioleWorkspaceDebug?.openNode?.('s203-batch-a'));
    await expect.poll(() => page.getByAltText('Batch 0').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(128);
    const root = path.resolve('.tmp/artifacts/S203');
    await mkdir(root, { recursive: true });
    await page.screenshot({ path: path.join(root, 'desktop-article-batch.png') });
    await writeFile(path.join(root, 'desktop-article-batch.json'), JSON.stringify({ first, retried, bodyPreserved: true }, null, 2));
  } finally {
    await desktopApp.evaluate(async () => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      await require(`${process.cwd()}/tests/desktop/harness/resourceProviderFixture.cjs`).closeResourceProvider(globalThis.__s203Batch);
    });
  }
});
