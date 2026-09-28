import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'remote-image-background-localization';
const SOURCE = 'https://background-image.example/cover.png';

interface PersistenceProbe {
  release: () => void;
  released: boolean;
  restore: () => void;
  started: boolean;
}

async function installHeldPersistence(app: ElectronApplication) {
  await app.evaluate(({ nativeImage }) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const pipeline = require(pathApi.join(process.cwd(), 'dist/electron/attachments/remoteImagePipeline.js'));
    const fs = require('node:fs').promises as typeof import('node:fs').promises;
    const originalWrite = fs.writeFile;
    const bytes = Uint8Array.from(nativeImage.createFromPath(
      pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png')
    ).resize({ height: 27, width: 43 }).toPNG());
    const imageHash = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    let resolveHeld!: () => void;
    const held = new Promise<void>((resolve) => { resolveHeld = resolve; });
    const state = globalThis as typeof globalThis & { __imagePersistenceProbe?: PersistenceProbe };
    state.__imagePersistenceProbe = {
      release: () => {
        state.__imagePersistenceProbe!.released = true;
        resolveHeld();
      },
      released: false,
      restore: () => { fs.writeFile = originalWrite; },
      started: false
    };
    setTimeout(() => state.__imagePersistenceProbe?.release(), 10_000);
    const write = fs as unknown as { writeFile: (...args: unknown[]) => Promise<void> };
    write.writeFile = async (...args) => {
      if (String(args[0]).includes(imageHash)) {
        state.__imagePersistenceProbe!.started = true;
        await held;
      }
      return Reflect.apply(originalWrite, fs, args);
    };
    pipeline.resetRemoteImagePipelineForTests();
    pipeline.configureRemoteImageFetchTransportForTests(async () =>
      new Response(bytes, { headers: { 'content-type': 'image/png' }, status: 200 })
    );
  });
}

test('shows a remote article image and keeps frames running while local saving waits', async (
  { desktopApp, desktopWindow }
) => {
  await expectWorkspaceShell(desktopWindow);
  await installHeldPersistence(desktopApp);
  try {
    await desktopWindow.evaluate(async ({ nodeId, source }) => {
      window.localStorage.setItem('foliole-auto-localize-remote-images', 'true');
      await window.__folioleWorkspaceDebug?.seedNodes?.([
        { content: `![Remote](${source})`, id: nodeId, kind: 'topic', title: 'Background image' }
      ], { persist: true });
      window.__folioleWorkspaceDebug?.openNode?.(nodeId);
    }, { nodeId: NODE_ID, source: SOURCE });

    await expect.poll(() => desktopApp.evaluate(() => (
      globalThis as typeof globalThis & { __imagePersistenceProbe?: PersistenceProbe }
    ).__imagePersistenceProbe?.started)).toBe(true);
    expect(await desktopApp.evaluate(() => (
      globalThis as typeof globalThis & { __imagePersistenceProbe?: PersistenceProbe }
    ).__imagePersistenceProbe?.released)).toBe(false);
    await expect.poll(() => desktopWindow.locator('img[alt="Remote"]').evaluate(
      (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
    )).toBe(true);
    const frameDelayMs = await desktopWindow.evaluate(async () => {
      const started = performance.now();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return performance.now() - started;
    });
    expect(frameDelayMs).toBeLessThan(500);
  } finally {
    await desktopApp.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { __imagePersistenceProbe?: PersistenceProbe }).__imagePersistenceProbe;
      probe?.release();
      probe?.restore();
    });
  }
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.content, NODE_ID
  )).toMatch(/asset:\/\//);
});
