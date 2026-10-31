import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const evidence = path.resolve('.tmp/artifacts/T672');
const lines = (count: number) => Array.from({ length: count }, (_, i) => `Line ${i + 1}`).join('\n\n');

async function openItem(page: Page, id: string, content: string, reveal: string) {
  await page.evaluate(async (node) => window.__folioleWorkspaceDebug!.seedNodes([node]),
    { id, title: 'Question', kind: 'item' as const, content, reveal });
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await page.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), id);
  await expect(page.locator('.answer-editor-host .cm-content')).toBeVisible();
}

async function metrics(page: Page) {
  return page.evaluate(() => {
    const stack = document.querySelector<HTMLElement>('.document-panel-editor-stack')!;
    const question = stack.querySelector<HTMLElement>('.prompt-editor-host .cm-scroller')!;
    const answer = stack.querySelector<HTMLElement>('.answer-editor-host .cm-scroller')!;
    const q = question.getBoundingClientRect().height;
    const a = answer.getBoundingClientRect().height;
    const questionHeight = stack.querySelector('[data-item-field="question"]')?.getBoundingClientRect().height
      ?? question.closest('.prompt-editor-host')!.parentElement!.parentElement!.getBoundingClientRect().height;
    const answerHeight = stack.querySelector('[data-item-field="answer"]')?.getBoundingClientRect().height
      ?? answer.closest('section')!.getBoundingClientRect().height;
    return { ratio: questionHeight / (questionHeight + answerHeight), questionOverflow: question.scrollHeight - q, answerOverflow: answer.scrollHeight - a };
  });
}

test('uses a stable lower answer divider for short items and lends spare space to long content', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await mkdir(evidence, { recursive: true });
  for (const height of [760, 1000]) {
    await desktopWindow.setViewportSize({ width: 1400, height });
    await openItem(desktopWindow, `short-${height}`, 'Short question.', 'Short answer.');
    await expect.poll(async () => (await metrics(desktopWindow)).ratio).toBeCloseTo(0.618, 2);
    await desktopWindow.screenshot({ path: path.join(evidence, `short-${height}.png`) });
  }
  await openItem(desktopWindow, 'long-answer', 'Short question.', lines(8));
  await expect.poll(async () => (await metrics(desktopWindow)).answerOverflow).toBeLessThanOrEqual(2);
  expect((await metrics(desktopWindow)).ratio).toBeLessThan(0.6);
  await desktopWindow.screenshot({ path: path.join(evidence, 'long-answer.png') });
  await openItem(desktopWindow, 'long-question', lines(10), 'Short answer.');
  await expect.poll(async () => (await metrics(desktopWindow)).questionOverflow).toBeLessThanOrEqual(2);
  expect((await metrics(desktopWindow)).ratio).toBeGreaterThan(0.63);
  await desktopWindow.screenshot({ path: path.join(evidence, 'long-question.png') });
  await openItem(desktopWindow, 'both-long', lines(70), lines(70));
  await expect.poll(async () => (await metrics(desktopWindow)).questionOverflow).toBeGreaterThan(100);
  expect((await metrics(desktopWindow)).answerOverflow).toBeGreaterThan(100);
  await desktopWindow.screenshot({ path: path.join(evidence, 'both-long.png') });
  await openItem(desktopWindow, 'empty', '', '');
  await expect.poll(async () => (await metrics(desktopWindow)).ratio).toBeCloseTo(0.618, 2);
  await desktopWindow.evaluate(() => window.__folioleDebug!.setEditorSelection('answer-editor', 0, 0));
  await desktopWindow.keyboard.insertText(lines(8));
  await expect.poll(async () => (await metrics(desktopWindow)).ratio).toBeLessThan(0.6);
  await expect.poll(async () => (await metrics(desktopWindow)).answerOverflow).toBeLessThanOrEqual(2);
  await desktopWindow.evaluate((length) => window.__folioleDebug!.setEditorSelection('answer-editor', 0, length), lines(8).length);
  await desktopWindow.keyboard.insertText('Short again.');
  await expect.poll(async () => (await metrics(desktopWindow)).ratio).toBeCloseTo(0.618, 2);
});

for (const imageSize of [{ width: 1200, height: 80 }, { width: 1024, height: 1024 }]) {
  test(`fits ${imageSize.width}x${imageSize.height} item images and keeps topics at full height`, async ({ desktopApp, desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await mkdir(evidence, { recursive: true });
    const bytesBase64 = await desktopApp.evaluate(({ nativeImage }, size) => nativeImage
      .createFromPath(`${process.cwd()}/assets/brand/foliole-leaf-tight.png`)
      .resize(size).toPNG().toString('base64'), imageSize);
    const hash = createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex');
    const image = `![Leaf](asset://${hash}.png)`;
    await desktopWindow.evaluate(async ({ bytesBase64, image }) => {
      await window.__folioleWorkspaceDebug!.seedNodes([
        { id: 'image-topic', title: 'Topic', kind: 'topic', content: 'Full height topic.' },
        { id: 'image-item', title: 'Question', kind: 'item', content: image, reveal: image }
      ]);
      await window.__folioleWorkspaceDebug!.importClipboardImageAttachment({ bytesBase64, mimeType: 'image/png', nodeId: 'image-item' });
      await window.__folioleWorkspaceDebug!.openNode('image-item');
    }, { bytesBase64, image });
    const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
    if (await exitFlow.isVisible()) await exitFlow.click();
    await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.openNode('image-item'));
    await expect(desktopWindow.locator('.answer-editor-host')).toBeVisible();
    await expect.poll(() => desktopWindow.locator('.document-panel-editor-stack img.cm-md-image-element').evaluateAll((images, width) =>
      images.length === 2 && images.every(image => (image as HTMLImageElement).naturalWidth === width), imageSize.width)).toBe(true);
    await expect.poll(async () => (await metrics(desktopWindow)).questionOverflow).toBeLessThanOrEqual(2);
    await expect.poll(async () => (await metrics(desktopWindow)).answerOverflow).toBeLessThanOrEqual(2);
    await desktopWindow.screenshot({ path: path.join(evidence, `images-${imageSize.width}x${imageSize.height}.png`) });
    await desktopWindow.evaluate(async ({ bytesBase64, hash }) => {
      await window.__folioleWorkspaceDebug!.seedNodes([{ id: 'topic', title: 'Topic', kind: 'topic',
        content: `Full height topic.\n\n![Leaf|268](asset://${hash}.png)` }]);
      await window.__folioleWorkspaceDebug!.importClipboardImageAttachment({ bytesBase64, mimeType: 'image/png', nodeId: 'topic' });
      await window.__folioleWorkspaceDebug!.openNode('topic');
    }, { bytesBase64, hash });
    await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Full height topic.');
    await expect.poll(() => desktopWindow.locator('.prompt-editor-host .cm-md-image-surface')
      .evaluate(surface => surface.getBoundingClientRect().width)).toBeCloseTo(268, 1);
    await expect(desktopWindow.locator('.answer-editor-host')).toHaveCount(0);
    expect(await desktopWindow.locator('.prompt-editor-host').evaluate(host =>
      host.getBoundingClientRect().height / document.querySelector('.document-panel-editor-stack')!.getBoundingClientRect().height)).toBeGreaterThan(0.98);
  });
}
