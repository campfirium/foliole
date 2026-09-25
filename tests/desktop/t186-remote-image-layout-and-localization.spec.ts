import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t186');
const URLS = {
  auto: 'https://t186.example/auto.png',
  largeA: 'https://t186.example/large-a.png',
  largeB: 'https://t186.example/large-b.png',
  onDemandA: 'https://t186.example/on-demand-a.png',
  onDemandB: 'https://t186.example/on-demand-b.png',
  smallA: 'https://t186.example/small-a.png',
  smallB: 'https://t186.example/small-b.png',
  smallC: 'https://t186.example/small-c.png'
};
const IDS = {
  anchor: 't186-anchor-source', auto: 't186-auto', layout: 't186-layout', onDemand: 't186-on-demand'
};

type Probe = { closes: Record<string, number>; firstChunks: Record<string, number>; requests: string[] };

async function installControlledImages(app: ElectronApplication) {
  await app.evaluate(({ nativeImage }) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const pipeline = require(pathApi.join(process.cwd(), 'dist/electron/attachments/remoteImagePipeline.js'));
    const source = nativeImage.createFromPath(pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png'));
    const large = Uint8Array.from(source.resize({ height: 360, width: 640 }).toPNG());
    const small = Uint8Array.from(source.resize({ height: 64, width: 64 }).toPNG());
    globalThis.__t186Probe = { closes: {}, firstChunks: {}, requests: [] };
    pipeline.resetRemoteImagePipelineForTests();
    pipeline.configureRemoteImagePipelineCacheRoot(pathApi.join(
      process.cwd(), '.tmp', 'desktop-acceptance', `t186-cache-${process.pid}-${Date.now()}`
    ));
    pipeline.configureRemoteImageFetchTransportForTests(async (url) => {
      globalThis.__t186Probe.requests.push(url);
      const bytes = url.includes('/small-') ? small : large;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 32));
          globalThis.__t186Probe.firstChunks[url] = Date.now();
          setTimeout(() => {
            controller.enqueue(bytes.slice(32));
            controller.close();
            globalThis.__t186Probe.closes[url] = Date.now();
          }, 900);
        }
      });
      return new Response(stream, { headers: { 'content-type': 'image/png' }, status: 200 });
    });
  });
}

async function seed(page: Page) {
  await page.evaluate(async ({ ids, urls }) => {
    window.localStorage.setItem('foliole-auto-localize-remote-images', 'false');
    const anchorContent = `![Anchor image](${urls.onDemandA})\n\nTarget phrase`;
    const anchorFrom = anchorContent.indexOf('Target phrase');
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      {
        content: `![Large A](${urls.largeA}) ![Large B](${urls.largeB})\n\n![Small A](${urls.smallA}) ![Small B](${urls.smallB}) ![Small C](${urls.smallC})\n\n![Large text](${urls.largeA}) trailing text`,
        id: ids.layout, kind: 'topic', title: 'T186 Layout'
      },
      { content: `![Automatic](${urls.auto})`, id: ids.auto, kind: 'topic', title: 'T186 Automatic' },
      {
        content: `![Demand A](${urls.onDemandA})\n![Demand B](${urls.onDemandB})`,
        id: ids.onDemand, kind: 'topic', title: 'T186 On Demand'
      },
      { content: anchorContent, id: ids.anchor, kind: 'topic', title: 'T186 Anchor' },
      {
        anchorLink: { id: 't186-anchor', kind: 'highlight', locator: {
          from: anchorFrom, originalText: 'Target phrase', to: anchorFrom + 13
        } },
        content: 'Target phrase', id: 't186-highlight', kind: 'item',
        parentNodeId: ids.anchor, title: 'Target phrase'
      }
    ], { persist: true });
  }, { ids: IDS, urls: URLS });
}

async function openNode(page: Page, nodeId: string) {
  expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id) ?? false, nodeId)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(nodeId);
}

async function waitForImages(page: Page, count: number) {
  await expect(page.locator('.cm-md-image-surface')).toHaveCount(count);
  await page.waitForFunction((expected) => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-surface img'));
    return images.length === expected && images.every((image) => image.complete && image.naturalWidth > 0);
  }, count);
}

async function inspectLinks(app: ElectronApplication, nodeId: string) {
  return app.evaluate((_electron, id) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const sqlite = connection.openDatabaseConnection().sqlite;
      return sqlite.prepare('SELECT attachment_id attachmentId FROM node_attachments WHERE node_id=?').all(id);
    });
  }, nodeId);
}

async function startFrameTrace(page: Page, alt: string) {
  await page.evaluate((targetAlt) => {
    const first = document.querySelector<HTMLImageElement>(`img[alt="${targetAlt}"]`);
    const trace = { blankFrames: 0, initialImage: first, samples: 0 };
    globalThis.__t186FrameTrace = trace;
    const sample = () => {
      const image = document.querySelector<HTMLImageElement>(`img[alt="${targetAlt}"]`);
      if (!image || !image.complete || image.naturalWidth === 0) trace.blankFrames += 1;
      trace.samples += 1;
      if (trace.samples < 60) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, alt);
}

async function localizeAndExcerptSecond(page: Page) {
  const second = page.getByAltText('Demand B').locator('..');
  await startFrameTrace(page, 'Demand B');
  const ribbon = page.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  await ribbon.getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('annotation');
  await palette.locator('button[aria-label="Annotate Selection"], button[aria-label="批注所选内容"]').click();
  await second.hover({ position: { x: 40, y: 40 } });
  await second.click({ position: { x: 40, y: 40 } });
  await expect.poll(() => page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.content, IDS.onDemand))
    .toMatch(/Demand A.*https:\/\/.*Demand B.*asset:\/\//s);
  const localSurface = page.getByAltText('Demand B').locator('..');
  await expect(localSurface).toHaveAttribute('data-md-image-excerpt-active', 'true');
  const bounds = await localSurface.boundingBox();
  if (!bounds) throw new Error('localized image surface has no bounds');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.6, { steps: 8 });
  await page.mouse.up();
  const note = page.getByRole('textbox', { name: /Add an annotation|添加批注/ });
  await expect(note).toBeVisible();
  await note.fill('T186 excerpt');
  await page.getByRole('button', { name: /Save|保存/, exact: true }).click();
  const excerpt = page.getByRole('treeitem', { name: /Excerpt 1/ });
  await expect(excerpt).toBeVisible();
  const excerptId = await excerpt.getAttribute('data-node-id');
  if (!excerptId) throw new Error('image excerpt node was not created');
  const result = await page.evaluate(async (id) => {
    const trace = globalThis.__t186FrameTrace;
    const current = document.querySelector<HTMLImageElement>('img[alt="Demand B"]');
    const beforeDelete = window.__folioleWorkspaceDebug?.getNode?.(id) ?? null;
    await window.__folioleWorkspaceDebug?.deleteNode?.(id);
    return {
      blankFrames: trace.blankFrames,
      excerptCreated: Boolean(beforeDelete),
      imageRebuilt: current !== trace.initialImage,
      samples: trace.samples
    };
  }, excerptId);
  await expect(excerpt).toBeHidden();
  return result;
}

async function saveEvidence(page: Page, testInfo: TestInfo, evidence: unknown) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const json = path.join(ARTIFACT_DIR, 't186-trace.json');
  const screenshot = path.join(ARTIFACT_DIR, 't186-final.png');
  await writeFile(json, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('t186-trace', { contentType: 'application/json', path: json });
  await testInfo.attach('t186-final', { contentType: 'image/png', path: screenshot });
}

test('stabilizes remote layout and supports automatic and targeted image excerpts', async (
  { desktopApp, desktopWindow }, testInfo
) => {
  test.setTimeout(180_000);
  await expectWorkspaceShell(desktopWindow);
  await installControlledImages(desktopApp);
  await seed(desktopWindow);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  await openNode(desktopWindow, IDS.layout);
  await expect(desktopWindow.getByAltText('Large A').locator('..')).toHaveCSS('aspect-ratio', '640 / 360');
  expect(await desktopWindow.getByAltText('Large A').evaluate((image: HTMLImageElement) => image.complete)).toBe(false);
  await waitForImages(desktopWindow, 6);
  await expect(desktopWindow.getByAltText('Large A').locator('..')).toHaveClass(/surface-block/);
  await expect(desktopWindow.getByAltText('Large B').locator('..')).toHaveClass(/surface-block/);
  for (const alt of ['Small A', 'Small B', 'Small C']) {
    await expect(desktopWindow.getByAltText(alt).locator('..')).toHaveClass(/surface-inline/);
  }
  expect(await inspectLinks(desktopApp, IDS.layout)).toHaveLength(0);

  await openNode(desktopWindow, IDS.onDemand);
  await waitForImages(desktopWindow, 2);
  const frameTrace = await localizeAndExcerptSecond(desktopWindow);
  expect(await inspectLinks(desktopApp, IDS.onDemand)).toHaveLength(1);
  expect(frameTrace).toMatchObject({ excerptCreated: true, imageRebuilt: true });
  expect(frameTrace.blankFrames).toBeLessThanOrEqual(1);

  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-auto-localize-remote-images', 'true'));
  await desktopWindow.getByRole('treeitem', { name: 'T186 Automatic' }).click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe(IDS.auto);
  await expect.poll(() => desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.content, IDS.auto))
    .toMatch(/asset:\/\//);
  await expect(desktopWindow.locator('.cm-md-image-surface-clozeable')).toBeVisible();
  expect(await inspectLinks(desktopApp, IDS.auto)).toHaveLength(1);

  await openNode(desktopWindow, IDS.anchor);
  await expect.poll(() => desktopWindow.evaluate((id) => {
    const parent = window.__folioleWorkspaceDebug?.getNode?.(id);
    const anchor = window.__folioleWorkspaceDebug?.getNode?.('t186-highlight')?.anchorLink;
    return anchor?.kind === 'highlight'
      && parent?.content.slice(anchor.locator.from, anchor.locator.to) === 'Target phrase';
  }, IDS.anchor)).toBe(true);

  const probe = await desktopApp.evaluate(() => structuredClone(globalThis.__t186Probe));
  for (const url of Object.values(URLS)) expect(probe.requests.filter((request) => request === url)).toHaveLength(1);
  expect(probe.firstChunks[URLS.largeA]).toBeLessThan(probe.closes[URLS.largeA]);
  await saveEvidence(desktopWindow, testInfo, { frameTrace, probe });
});

declare global {
  var __t186FrameTrace: { blankFrames: number; initialImage: HTMLImageElement | null; samples: number };
  var __t186Probe: Probe;
}
