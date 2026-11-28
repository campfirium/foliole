import { createHash } from 'node:crypto';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const NODE_ID = 'long-image-scroll-stability';
const REMOTE_NODE_ID = 'long-remote-image-scroll-stability';
const REMOTE_URL = 'https://cdn.example/long.png';
const FILLER = Array.from({ length: 150 }, (_, index) => `Paragraph ${index} keeps the document scrolling.`).join('\n\n');

function createTallPng(app: ElectronApplication) {
  return app.evaluate(({ nativeImage }) => {
    const source = nativeImage.createFromPath(`${process.cwd()}/assets/brand/foliole-leaf-tight.png`);
    return source.resize({ width: 800, height: 6000 }).toPNG().toString('base64');
  });
}

async function expectStableScrollRoundTrips(page: Page, nodeId: string) {
  const image = page.locator(`[data-md-image-editor-node-id="${nodeId}"] img`);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.getBoundingClientRect().height)).toBeGreaterThan(1000);

  const scroller = page.locator('.cm-scroller').filter({ has: page.locator('.cm-content') }).first();
  const samples = await sampleScrollRoundTrips(scroller);
  process.stdout.write(`long image samples ${nodeId} ${JSON.stringify(samples)}\n`);

  for (const round of samples.rounds) {
    expect(round.rebuilt).toBe(true);
    expect(round.placeholders).toBe(0);
    expect(round.framesWithImage).toBe(40);
    expect(samples.loaded.imageHeight - round.minImageHeight).toBeLessThan(2);
    // Off-screen text lines are re-estimated by CodeMirror, so only image-sized changes count.
    expect(samples.loaded.scrollHeight - round.minScrollHeight).toBeLessThan(500);
  }
}

// Serves the tall image for the remote URL without touching the network.
async function stubRemoteImage(app: ElectronApplication, pngBase64: string) {
  await app.evaluate(async (_electron, base64) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const pipeline = require(pathApi.join(process.cwd(), 'dist/electron/attachments/remoteImagePipeline.js'));
    pipeline.resetRemoteImagePipelineForTests();
    pipeline.configureRemoteImagePipelineCacheRoot(pathApi.join(
      process.cwd(), '.tmp', 'desktop-acceptance', `long-remote-image-cache-${process.pid}-${Date.now()}`
    ));
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
    pipeline.configureRemoteImageFetchTransportForTests(async () =>
      new Response(bytes, { headers: { 'content-type': 'image/png' }, status: 200 }));
  }, pngBase64);
}

// Scrolls the image away and back, sampling the layout on every frame of the return.
function sampleScrollRoundTrips(scroller: Locator) {
  return scroller.evaluate(async (element) => {
    const frames = async (count: number, onFrame?: () => void) => {
      for (let index = 0; index < count; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        onFrame?.();
      }
    };
    const readImageHeight = () => element.querySelector('.cm-md-image-widget')?.getBoundingClientRect().height ?? null;
    let placeholders = 0;
    new MutationObserver((records) => {
      for (const node of records.flatMap((record) => Array.from(record.addedNodes))) {
        if (node instanceof Element && node.querySelector('[data-md-image-status="loading"]')) placeholders += 1;
      }
    }).observe(element, { childList: true, subtree: true });
    const loaded = { imageHeight: readImageHeight() ?? 0, scrollHeight: element.scrollHeight };
    const rounds = [];
    for (let round = 0; round < 3; round += 1) {
      const before = element.querySelector('.cm-md-image-widget');
      element.scrollTop = element.scrollHeight;
      await frames(20);
      const rebuilt = !before?.isConnected;
      const scrollHeights = [element.scrollHeight];
      const imageHeights: number[] = [];
      element.scrollTop = 3000;
      await frames(40, () => {
        scrollHeights.push(element.scrollHeight);
        const height = readImageHeight();
        if (height !== null) imageHeights.push(height);
      });
      rounds.push({
        framesWithImage: imageHeights.length,
        minImageHeight: Math.min(...imageHeights),
        minScrollHeight: Math.min(...scrollHeights),
        placeholders,
        rebuilt
      });
    }
    return { loaded, rounds };
  });
}

test('keeps a long local image at a stable height when it scrolls back into view', async ({ desktopApp, desktopWindow }) => {
  const bytesBase64 = await createTallPng(desktopApp);
  const hash = createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex');
  const content = `Intro\n\n![Long](asset://${hash}.png)\n\n${FILLER}`;
  await desktopWindow.evaluate(async ({ nodeId, bytesBase64, content }) => {
    const debug = window.__folioleWorkspaceDebug;
    if (!debug?.seedNodes || !debug.importClipboardImageAttachment) throw new Error('Attachment helpers unavailable');
    await debug.seedNodes([{ id: nodeId, kind: 'topic', title: 'Long image', content }], { persist: true });
    const imported = await debug.importClipboardImageAttachment({
      bytesBase64, mimeType: 'image/png', nodeId, originalName: 'long.png'
    });
    if (!imported) throw new Error('Attachment import failed');
    await debug.openNode?.(nodeId);
  }, { nodeId: NODE_ID, bytesBase64, content });

  await expectStableScrollRoundTrips(desktopWindow, NODE_ID);
});

test('keeps a long remote image at a stable height when it scrolls back into view', async ({ desktopApp, desktopWindow }) => {
  await stubRemoteImage(desktopApp, await createTallPng(desktopApp));
  await desktopWindow.evaluate(async ({ nodeId, content }) => {
    window.localStorage.setItem('foliole-auto-localize-remote-images', 'false');
    const debug = window.__folioleWorkspaceDebug;
    if (!debug?.seedNodes) throw new Error('Seed helper unavailable');
    await debug.seedNodes([{ id: nodeId, kind: 'topic', title: 'Long remote image', content }], { persist: true });
    await debug.openNode?.(nodeId);
  }, { nodeId: REMOTE_NODE_ID, content: `Intro\n\n![Long](${REMOTE_URL})\n\n${FILLER}` });

  await expectStableScrollRoundTrips(desktopWindow, REMOTE_NODE_ID);
});
