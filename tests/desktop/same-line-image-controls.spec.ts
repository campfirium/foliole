import { createHash } from 'node:crypto';
import path from 'node:path';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const nodeId = 'same-line-image-controls';
const otherId = 'same-line-image-other';
const labels = ['PNG figure', 'JPEG figure'];

async function openNode(page: Page, id: string) {
  await page.evaluate(node => window.__folioleWorkspaceDebug!.openNode(node), id);
}

async function previewImage(page: Page, widget: Locator, alt: string) {
  const imageSrc = await widget.locator('img').getAttribute('src') ?? '';
  await widget.locator('.cm-md-image-surface').hover();
  await widget.getByRole('button', { name: 'Open image preview' }).click({ timeout: 5000 });
  const dialog = page.getByRole('dialog');
  const preview = dialog.getByRole('img', { name: alt });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('src', imageSrc);
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await dialog.getByRole('button', { name: 'Close image preview' }).click();
  await expect(dialog).toHaveCount(0);
}

async function dragResize(page: Page, widget: Locator, delta: number) {
  const handle = widget.getByRole('button', { name: 'Resize image' });
  await handle.hover();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function createCloze(page: Page, widget: Locator) {
  const image = widget.locator('img');
  await widget.locator('.cm-md-image-surface').hover();
  const box = (await image.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Confirm image cloze' }).click();
  await expect(widget.locator('.cm-md-image-cloze-region')).toHaveCount(1);
}

async function seedFigures(desktopApp: ElectronApplication, page: Page) {
  const payloads = await desktopApp.evaluate(({ nativeImage }) => {
    const source = nativeImage.createFromPath(`${process.cwd()}/assets/brand/foliole-leaf-tight.png`);
    return [
      source.resize({ width: 420, height: 220 }).toPNG().toString('base64'),
      source.resize({ width: 380, height: 200 }).toJPEG(90).toString('base64')
    ];
  });
  const fixtures = payloads.map((bytesBase64, index) => {
    const ext = index === 0 ? 'png' : 'jpg';
    const hash = createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex');
    return { bytesBase64, mimeType: index === 0 ? 'image/png' : 'image/jpeg',
      originalName: `figure.${ext}`, markdown: `![${labels[index]}](asset://${hash}.${ext})` };
  });
  const content = fixtures.map(image => image.markdown).join('');
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ content, fixtures, nodeId, otherId }) => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([
      { id: nodeId, kind: 'topic', title: 'Same-line figures', content },
      { id: otherId, kind: 'topic', title: 'Other topic', content: 'Something else' }
    ], { persist: true });
    for (const { bytesBase64, mimeType, originalName } of fixtures) {
      if (!await debug.importClipboardImageAttachment!({ bytesBase64, mimeType, originalName, nodeId })) {
        throw new Error(`Failed to import ${originalName}`);
      }
    }
  }, { content, fixtures, nodeId, otherId });
  await openNode(page, nodeId);
  return content;
}

test('independently previews and resizes block images on the same Markdown line', async ({
  desktopApp, desktopWindow: page
}, info) => {
  const content = await seedFigures(desktopApp, page);
  const widgets = labels.map(alt =>
    page.locator(`[data-md-image-editor-node-id="${nodeId}"]`).filter({ has: page.getByRole('img', { name: alt }) }));
  for (const widget of widgets) await expect(widget).toHaveAttribute('data-md-image-display', 'block');
  expect((await loadNodeDocument(page, nodeId))?.content).toBe(content);
  await page.screenshot({ path: info.outputPath('initial-block-display.png') });
  await previewImage(page, widgets[0]!, labels[0]!);
  await previewImage(page, widgets[1]!, labels[1]!);
  await createCloze(page, widgets[0]!);
  const firstImage = widgets[0]!.locator('img');
  const secondImage = widgets[1]!.locator('img');
  const firstWidth = (await firstImage.boundingBox())!.width;
  const secondWidth = (await secondImage.boundingBox())!.width;
  const delta = -75;
  const resizedContent = content.replace('PNG figure]', `PNG figure|${Math.round(firstWidth + delta)}]`);
  await dragResize(page, widgets[0]!, delta);
  await expect.poll(async () => (await loadNodeDocument(page, nodeId))?.content).toBe(resizedContent);

  await openNode(page, otherId);
  await expect(widgets[0]!).toHaveCount(0);
  await openNode(page, nodeId);
  for (const widget of widgets) {
    await expect(widget).toHaveAttribute('data-md-image-display', 'block');
    await expect(widget.getByRole('button', { name: 'Resize image' })).toBeVisible();
  }
  await expect.poll(async () => (await firstImage.boundingBox())?.width).toBeCloseTo(firstWidth + delta, 0);
  expect((await secondImage.boundingBox())?.width).toBeCloseTo(secondWidth, 0);
  await previewImage(page, widgets[0]!, labels[0]!);
  await previewImage(page, widgets[1]!, labels[1]!);
  await expect(widgets[0]!.locator('.cm-md-image-cloze-region')).toHaveCount(1);
  await expect(widgets[1]!.locator('.cm-md-image-cloze-region')).toHaveCount(0);
  expect((await loadNodeDocument(page, nodeId))?.content).toBe(resizedContent);
  const userData = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptor = path.join(userData, 'cache', 'agent-control-session.json');
  expect(await runAgentCli(['materials/read', '--descriptor', descriptor, '--id', nodeId, '--content-mode', 'full']))
    .toMatchObject({ status: 0, output: { material: { content: resizedContent } } });
  await widgets[0]!.locator('.cm-md-image-surface').hover();
  await expect(widgets[0]!.getByRole('button', { name: 'Open image preview' })).toHaveCSS('opacity', '1');
  await expect(widgets[0]!.getByRole('button', { name: 'Resize image' })).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('resized-figure-with-controls.png') });
});
