import type { ElectronApplication, Page } from '@playwright/test';

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
    const imageWidth = 40 + (Date.now() % 91);
    const bytes = Uint8Array.from(nativeImage.createFromPath(
      pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png')
    ).resize({ height: 27, width: imageWidth }).toPNG());
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
    pipeline.configureRemoteImagePipelineCacheRoot(pathApi.join(
      process.cwd(), '.tmp', 'desktop-acceptance', `background-image-${process.pid}-${Date.now()}`
    ));
    pipeline.configureRemoteImageFetchTransportForTests(async () =>
      new Response(bytes, { headers: { 'content-type': 'image/png' }, status: 200 })
    );
  });
}

async function startFrameTrace(page: Page) {
  await page.evaluate(() => {
    const trace = { blankFrames: 0, switchedFrames: 0, samples: 0 };
    (window as typeof window & { __remoteImageFrameTrace?: typeof trace }).__remoteImageFrameTrace = trace;
    const sample = () => {
      const image = document.querySelector<HTMLImageElement>('img[alt="Remote"]');
      if (!image?.complete || !image.naturalWidth) trace.blankFrames += 1;
      else if (!image.src.startsWith('foliole-remote-image://')) trace.switchedFrames += 1;
      trace.samples += 1;
      if (trace.samples < 100) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function expectRetainedDisplayAndReopen(page: Page) {
  await expect.poll(() => page.locator('img[alt="Remote"]').evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
      && image.src.startsWith('foliole-remote-image://')
  )).toBe(true);
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __remoteImageFrameTrace?: { samples: number } }
  ).__remoteImageFrameTrace?.samples)).toBe(100);
  const frameTrace = await page.evaluate(() => (
    window as typeof window & { __remoteImageFrameTrace?: { blankFrames: number; switchedFrames: number } }
  ).__remoteImageFrameTrace);
  expect(frameTrace?.switchedFrames).toBe(0);
  expect(frameTrace?.blankFrames).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.__folioleWorkspaceDebug?.openNode?.('remote-image-other'));
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe('remote-image-other');
  await page.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), NODE_ID);
  await expect.poll(() => page.locator('img[alt="Remote"]').evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
      && image.src.startsWith('foliole-asset://')
  )).toBe(true);
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
        { content: `![Remote](${source})`, id: nodeId, kind: 'topic', title: 'Background image' },
        { content: 'Other article', id: 'remote-image-other', kind: 'topic', title: 'Other article' }
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
    await startFrameTrace(desktopWindow);
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
  await expectRetainedDisplayAndReopen(desktopWindow);
});
