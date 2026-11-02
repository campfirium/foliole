import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const PREVIEW = /^(Preview|预览)$/;

test('temporarily reveals the article and returns to the same reading settings', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([{ id: 'reading-preview', kind: 'topic', title: 'Reading preview',
      content: '[Preview link](https://example.com)\n\n中文正文 Reading preview 2026' }]);
    await api.openNode('reading-preview');
  });
  const dialog = await openSettingsCategory(desktopWindow, 'Typography');
  const size = dialog.getByLabel(/^(Interface font size|界面字号)$/);
  await size.fill('19');
  await size.hover();
  await desktopWindow.mouse.wheel(0, 100);
  const scroller = dialog.locator('.scroll-pt-20');
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const scrollTop = await scroller.evaluate((element) => element.scrollTop);
  await dialog.getByRole('button', { name: PREVIEW }).click();
  await expect(dialog).toHaveCSS('opacity', '0');
  await expect(dialog).toHaveAttribute('inert', '');
  const hiddenScrollTop = await scroller.evaluate((element) => element.scrollTop);
  const paragraph = desktopWindow.locator('.prompt-editor-host .cm-line').filter({ hasText: '中文正文 Reading preview 2026' });
  await expect(paragraph).toHaveCSS('font-size', '19px');
  const directory = path.resolve('.tmp/artifacts/T681');
  await mkdir(directory, { recursive: true });
  await desktopWindow.screenshot({ path: path.join(directory, 'reading-settings-hidden.png') });
  const link = desktopWindow.locator('.prompt-editor-host .cm-md-link-text').filter({ hasText: 'Preview link' });
  await link.evaluate((element) => {
    element.setAttribute('data-preview-hits', '0');
    for (const event of ['pointerdown', 'click']) element.addEventListener(event, () => element.setAttribute('data-preview-hits', '1'));
  });
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  await desktopWindow.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(link).toHaveAttribute('data-preview-hits', '0');
  expect(await scroller.evaluate((element) => element.scrollTop), JSON.stringify({ scrollTop, hiddenScrollTop })).toBe(hiddenScrollTop);
  await expect(size).toHaveValue('19');
  await expect(dialog.getByRole('heading', { level: 2, name: /^(Typography|字体与排版)$/ })).toBeVisible();
  for (const key of ['Escape', 'Enter']) {
    await dialog.getByRole('button', { name: PREVIEW }).click();
    await expect(dialog).toHaveCSS('opacity', '0');
    await desktopWindow.keyboard.press(key);
    await expect(dialog).toHaveCSS('opacity', '1');
    await expect(dialog).not.toHaveAttribute('inert');
  }
  await size.fill('21');
  await dialog.getByRole('button', { name: PREVIEW }).click();
  await expect(dialog).toHaveCSS('opacity', '0');
  await expect(paragraph).toHaveCSS('font-size', '21px');
  await desktopWindow.keyboard.press('Escape');
  await expect(size).toHaveValue('21');
  await desktopWindow.screenshot({ path: path.join(directory, 'reading-settings-restored.png') });
});
