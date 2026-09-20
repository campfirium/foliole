import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

type ResourceFixture = { keys: string[]; requests: string[]; endpoint: string };
declare global {
  var __s203Batch: ResourceFixture & { server: import('node:http').Server };
}

async function startProvider(app: ElectronApplication) {
  return app.evaluate(async ({ nativeImage }) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const http = process.getBuiltinModule('http')!;
    const crypto = process.getBuiltinModule('crypto')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const encryption = require(pathApi.join(process.cwd(), 'dist/electron/sync/workgroupHttpCrypto.js'));
    const source = nativeImage.createFromPath(pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png'));
    const files = [128, 129, 130, 131].map((width) => source.resize({ width, height: 80 }).toPNG());
    const keys = files.map((bytes) => `${crypto.createHash('sha256').update(bytes).digest('hex')}.png`);
    const requests: string[] = [];
    const server = http.createServer((request, response) => {
      const id = new URL(request.url!, 'http://localhost').searchParams.get('attachment_id')!;
      requests.push(id);
      const index = keys.findIndex((key) => key.startsWith(id));
      if (index === 2) { request.socket.destroy(); return; }
      const found = index === 0 || index === 3;
      const contentType = found ? 'image/png' : 'application/json';
      const body = found ? files[index]! : Buffer.from('{"error":"missing_file"}');
      response.writeHead(found ? 200 : 404, {
        'Content-Type': encryption.WORKGROUP_ENVELOPE_CONTENT_TYPE,
        'X-Foliole-Original-Content-Type': contentType
      });
      response.end(encryption.encryptWorkgroupResponse(request, body, contentType));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as import('node:net').AddressInfo;
    globalThis.__s203Batch = { endpoint: `http://127.0.0.1:${address.port}`, keys, requests, server };
    return { keys, endpoint: globalThis.__s203Batch.endpoint };
  });
}

async function runBatch(app: ElectronApplication, ids: string[]) {
  return app.evaluate(async (_, articleIds) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const group = require(pathApi.join(process.cwd(), 'dist/electron/database/syncGroupStore.js')).loadDesktopSyncGroup();
    const resources = require(pathApi.join(process.cwd(), 'dist/electron/sync/desktopSyncGroupResources.js'));
    const result = await resources.downloadDesktopSyncGroupResources({ endpoint_url: globalThis.__s203Batch.endpoint,
      group_id: group.group_id, local_device_id: group.local_device_identity_key }, articleIds);
    const resolver = require(pathApi.join(process.cwd(), 'dist/electron/attachments/resourceResolver.js'));
    return { ...result, requests: [...globalThis.__s203Batch.requests],
      files: globalThis.__s203Batch.keys.map((key) => resolver.resolveAttachmentFile(key).status) };
  }, ids);
}

test('fetches only participating article files once and preserves bodies through 404 and disconnect', async ({ desktopApp, desktopWindow: page }) => {
  test.setTimeout(180_000);
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
        { id: 's203-batch-other', kind: 'topic', title: 'Unrelated article', content: `![Other](asset://${keys[3]})` }
      ], { persist: true });
    }, { content, keys });
    await expect.poll(async () => (await loadNodeDocument(page, 's203-batch-a'))?.content).toBe(content);
    const first = await runBatch(desktopApp, ['s203-batch-a', 's203-batch-b']);
    expect(first.requests).toHaveLength(3);
    expect(new Set(first.requests).size).toBe(3);
    expect(first.failedStorageKeys.sort()).toEqual(keys.slice(1, 3).sort());
    expect(first.files).toEqual(['ready', 'missing_file', 'missing_file', 'missing_file']);
    expect((await loadNodeDocument(page, 's203-batch-a'))?.content).toBe(content);
    expect((await runBatch(desktopApp, [])).requests).toEqual(first.requests);
    expect((await runBatch(desktopApp, ['s203-batch-b'])).requests).toEqual(first.requests);
    const retried = await runBatch(desktopApp, ['s203-batch-a']);
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
      await new Promise<void>((resolve, reject) => globalThis.__s203Batch.server.close((error) => error ? reject(error) : resolve()));
    });
  }
});
