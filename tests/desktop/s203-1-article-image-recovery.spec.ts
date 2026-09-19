import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE = 'https://s203.example/image.png';
const ARTIFACT = path.resolve('.tmp/artifacts/S203/desktop-recovery.png');

declare global {
  var __s203Images: { changed: boolean; failed: boolean; requests: number };
}

async function installImages(app: ElectronApplication) {
  await app.evaluate(({ nativeImage }) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const pipeline = require(pathApi.join(process.cwd(), 'dist/electron/attachments/remoteImagePipeline.js'));
    const source = nativeImage.createFromPath(pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png'));
    const original = Uint8Array.from(source.resize({ width: 320, height: 180 }).toPNG());
    const changed = Uint8Array.from(source.resize({ width: 300, height: 200 }).toPNG());
    globalThis.__s203Images = { changed: false, failed: false, requests: 0 };
    pipeline.resetRemoteImagePipelineForTests();
    pipeline.configureRemoteImagePipelineCacheRoot(pathApi.join(process.cwd(), '.tmp', 'artifacts', 'S203', `cache-${process.pid}`));
    pipeline.configureRemoteImageFetchTransportForTests(async () => {
      globalThis.__s203Images.requests += 1;
      if (globalThis.__s203Images.failed) return new Response(null, { status: 404 });
      return new Response(globalThis.__s203Images.changed ? changed : original, { status: 200 });
    });
  });
}

async function open(page: Page, id: string) {
  await expect.poll(() => page.evaluate((nodeId) => Boolean(window.__folioleWorkspaceDebug?.getNode?.(nodeId)), id)).toBe(true);
  expect(await page.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), id)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(id);
}

async function ready(page: Page) {
  const image = page.getByAltText('Recovery image');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
}

async function removeFixtureFile(app: ElectronApplication, storageKey: string, changed: boolean, failed = false) {
  await app.evaluate(async (_, args) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { readAttachmentLibraryPathSnapshot } = require(pathApi.join(process.cwd(), 'dist/electron/attachments/attachmentLibraryPathSnapshot.js'));
    await fs.promises.unlink(pathApi.join(readAttachmentLibraryPathSnapshot().assetsDir, args.storageKey));
    globalThis.__s203Images.changed = args.changed;
    globalThis.__s203Images.failed = args.failed;
  }, { storageKey, changed, failed });
}

async function seed(page: Page) {
  await page.evaluate(async (source) => {
    window.localStorage.setItem('foliole-auto-localize-remote-images', 'true');
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id: 's203-main', kind: 'topic', title: 'Recovery article', content: `![Recovery image](${source})` },
      { id: 's203-sibling', kind: 'topic', title: 'Sibling article', content: `![Recovery image](${source})` },
      { id: 's203-away', kind: 'topic', title: 'Switch article', content: 'Switch target' }
    ], { persist: true });
  }, SOURCE);
}

async function localizedKey(page: Page, id: string) {
  await open(page, id);
  await expect.poll(async () => (await loadNodeDocument(page, id))?.content).toMatch(/asset:\/\//);
  await ready(page);
  return (await loadNodeDocument(page, id))!.content.match(/asset:\/\/([a-f0-9]{64}\.png)/)![1]!;
}

test('recovers missing images and changes only the requesting article', async ({ desktopApp, desktopWindow: page }) => {
  test.setTimeout(180_000);
  await expectWorkspaceShell(page);
  await installImages(desktopApp);
  await seed(page);
  const oldKey = await localizedKey(page, 's203-main');
  expect(await localizedKey(page, 's203-sibling')).toBe(oldKey);
  const requests = await desktopApp.evaluate(() => globalThis.__s203Images.requests);
  await open(page, 's203-main');
  await ready(page);
  expect(await desktopApp.evaluate(() => globalThis.__s203Images.requests)).toBe(requests);

  await open(page, 's203-away');
  await removeFixtureFile(desktopApp, oldKey, false);
  await page.reload();
  await expectWorkspaceShell(page);
  await open(page, 's203-main');
  await ready(page);
  expect((await loadNodeDocument(page, 's203-main'))?.content).toContain(oldKey);

  await open(page, 's203-away');
  await removeFixtureFile(desktopApp, oldKey, true);
  await page.reload();
  await expectWorkspaceShell(page);
  await open(page, 's203-main');
  await expect.poll(async () => (await loadNodeDocument(page, 's203-main'))?.content).not.toContain(oldKey);
  await ready(page);
  expect((await loadNodeDocument(page, 's203-sibling'))?.content).toContain(oldKey);
  await mkdir(path.dirname(ARTIFACT), { recursive: true });
  await page.screenshot({ path: ARTIFACT });
  const recovered = (await loadNodeDocument(page, 's203-main'))!.content;
  const newKey = recovered.match(/asset:\/\/([a-f0-9]{64}\.png)/)![1]!;
  const state = await inspectState(desktopApp);
  expect(state.files).toContain(newKey);
  expect(state.rows.find((row) => row.id === 's203-main')?.image_sources).not.toContain(oldKey);
  await open(page, 's203-away');
  await removeFixtureFile(desktopApp, newKey, true, true);
  await page.reload();
  await expectWorkspaceShell(page);
  await open(page, 's203-main');
  await expect.poll(async () => (await inspectState(desktopApp)).probe.requests).toBeGreaterThan(state.probe.requests);
  await expect(page.getByAltText('Recovery image')).toHaveCount(0);
  expect((await loadNodeDocument(page, 's203-main'))?.content).toBe(recovered);
});

async function inspectState(app: ElectronApplication) {
  return app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const snapshot = require(pathApi.join(process.cwd(), 'dist/electron/attachments/attachmentLibraryPathSnapshot.js')).readAttachmentLibraryPathSnapshot();
    const rows = await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.queryAll(
      "SELECT id, content, image_sources FROM nodes WHERE id LIKE 's203-%'"
    ));
    return { rows, files: await fs.promises.readdir(snapshot.assetsDir), probe: globalThis.__s203Images };
  });
}
