import path from 'node:path';

import type { Page } from '@playwright/test';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { redoShortcut, undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { clozeIds, dragImageCloze, openSource, OWNER_ID, readDocument, seedImageSource } from './harness/imageClozeSource';
import { expectWorkspaceShell } from './harness/settings';

async function openCropFromDraft(page: Page) {
  await dragImageCloze(page);
  const draft = page.locator('.cm-md-image-cloze-draft:visible').first();
  const initial = await draft.evaluate(element => (element as HTMLElement).style.cssText);
  await page.getByRole('button', { name: 'Crop image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit crop' });
  await expect(dialog).toBeVisible();
  const frame = dialog.locator('.cm-md-image-crop-frame');
  expect(await frame.evaluate(element => (element as HTMLElement).style.cssText)).toBe(initial);
  return { dialog, frame, initial };
}

async function moveCropHandle(page: Page) {
  const handle = page.getByRole('button', { name: 'Bottom right crop handle' });
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error('Expected crop handle');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 18, bounds.y - 35, { steps: 6 });
  await page.mouse.up();
}

async function replaceBodyThroughAgentControl(descriptor: string, currentContent: string, next: string) {
  const current = await runAgentCli(['materials/read', '--descriptor', descriptor, '--id', OWNER_ID, '--content-mode', 'full']);
  expect(current).toMatchObject({ status: 0, output: { material: { content: currentContent } } });
  const edit = await runAgentCli(['materials/update', '--descriptor', descriptor, '--id', OWNER_ID,
    '--expected-updated-at', current.output.material.updated_at, '--content-stdin', 'true'],
  { stdin: [Buffer.from(next)] });
  expect(edit.status).toBe(0);
}

async function prependEditorParagraph(page: Page, lead: string) {
  await page.locator('.prompt-editor-host .cm-content').focus();
  await expect.poll(() => page.evaluate(() =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0))).toBe(true);
  await page.keyboard.insertText(`${lead}\n\n`);
}

async function expectSavedCropFrame(frame: import('@playwright/test').Locator, saved: string) {
  const [, left, top, right, bottom] = /;crop=(\d+),(\d+),(\d+),(\d+)/u.exec(saved)!.map(Number);
  const savedFrame = await frame.evaluate(element => {
    const { left, top, width, height } = (element as HTMLElement).style;
    return [left, top, width, height].map(value => Math.round(Number.parseFloat(value) * 100));
  });
  expect(savedFrame).toEqual([left, top, right! - left!, bottom! - top!]);
}

test('crops one occurrence, restores its draft on cancel, and reopens the saved crop after reload', async ({ desktopWindow: page }, info) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page, 2);
  const original = (await readDocument(page, OWNER_ID)).content;

  const originalHeight = (await page.locator('.cm-md-image-surface-block').first().boundingBox())!.height;
  const draft = await openCropFromDraft(page);
  await moveCropHandle(page);
  expect(await draft.frame.evaluate(element => (element as HTMLElement).style.cssText)).not.toBe(draft.initial);
  await draft.dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(draft.dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Confirm image cloze' })).toBeVisible();
  const beforeCrop = (await readDocument(page, OWNER_ID)).content;
  expect(beforeCrop).toBe(original);

  await page.getByRole('button', { name: 'Crop image', exact: true }).click();
  await moveCropHandle(page);
  await draft.dialog.screenshot({ path: info.outputPath('adjusting-original-image.png') });
  await draft.dialog.getByRole('button', { name: 'Apply crop' }).click();
  const viewport = page.locator('.cm-md-image-crop-viewport');
  await expect(viewport).toHaveCount(1);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toContain(';crop=');
  const saved = (await readDocument(page, OWNER_ID)).content;
  expect(saved.split('\n\n')[1]).toBe(original.split('\n\n')[1]);
  await expect(viewport).toHaveCSS('overflow', 'hidden');
  await expect.poll(async () => (await viewport.boundingBox())?.height ?? Infinity).toBeLessThan(originalHeight);

  await page.keyboard.press(undoShortcut());
  await expect(viewport).toHaveCount(0);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toBe(original);
  await page.keyboard.press(redoShortcut());
  await expect(viewport).toHaveCount(1);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toBe(saved);

  const lead = 'A paragraph before the cropped image.';
  await prependEditorParagraph(page, lead);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toBe(`${lead}\n\n${saved}`);
  await page.reload();
  await expectWorkspaceShell(page);
  await openSource(page);
  await expect(viewport).toHaveCount(1);
  await expect(page.locator('.cm-content').getByText(lead)).toBeVisible();
  await page.screenshot({ path: info.outputPath('cropped-markdown-image.png') });
  await page.locator('.cm-md-image-surface').filter({ has: viewport }).hover();
  await page.getByRole('button', { name: 'Edit crop' }).click();
  await expect(draft.dialog.locator('img')).toHaveAttribute('src', await viewport.locator('img').getAttribute('src') ?? '');
  await expectSavedCropFrame(draft.frame, saved);
  await draft.dialog.getByRole('button', { name: 'Remove crop' }).click();
  await expect(viewport).toHaveCount(0);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toBe(`${lead}\n\n${original}`);
});

test('keeps focus and creates a review region in original image coordinates after cropping', async ({ desktopWindow: page }, info) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page);
  await dragImageCloze(page);
  await page.getByRole('button', { name: 'Focus image region' }).click();
  const { dialog } = await openCropFromDraft(page);
  await dialog.getByRole('button', { name: 'Apply crop' }).click();

  const viewport = page.locator('.cm-md-image-crop-viewport');
  await expect(viewport.locator('.cm-md-image-focus-mask')).toBeVisible();
  await dragImageCloze(page, true);
  await page.getByRole('button', { name: 'Confirm image cloze' }).click();
  await expect.poll(() => clozeIds(page)).toHaveLength(1);
  const [clozeId] = await clozeIds(page);
  const item = await readDocument(page, clozeId!);
  await expect(page.getByRole('treeitem', { name: 'Original image', exact: true })).toBeVisible();
  const [region] = item.imageRegions!.flatMap(group => group.regions);
  expect(region?.x).toBeCloseTo(0.59, 1);
  expect(region?.y).toBeCloseTo(0.39, 1);
  expect(region?.width).toBeCloseTo(0.08, 1);
  expect(region?.height).toBeCloseTo(0.08, 1);

  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), clozeId!);
  await expect(page.locator('.cm-md-image-cloze-region[data-region-state="hidden"]')).toBeVisible();
  await expect(viewport).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('full-image-cloze-prompt.png') });
});

test('writes and reads cropped Markdown unchanged through Agent Control', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page, 2);
  const original = (await readDocument(page, OWNER_ID)).content;
  const cropped = original.replace('[Original image]', '[Original image;crop=2000,3500,7000,7500]');
  const userData = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptor = path.join(userData, 'cache', 'agent-control-session.json');
  await replaceBodyThroughAgentControl(descriptor, original, cropped);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toBe(cropped);
  expect(await runAgentCli(['materials/read', '--descriptor', descriptor, '--id', OWNER_ID, '--content-mode', 'full']))
    .toMatchObject({ status: 0, output: { material: { content: cropped } } });
  await page.reload();
  await expectWorkspaceShell(page);
  await openSource(page);
  await expect(page.locator('.cm-md-image-crop-viewport')).toHaveCount(1);
});
