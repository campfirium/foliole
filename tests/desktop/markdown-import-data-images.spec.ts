import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

test('turns an oversized inline image from a Markdown file into a visible image with its menu', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const artifacts = path.resolve('.tmp/artifacts/T899');
  await fs.mkdir(artifacts, { recursive: true });
  const imageBase64 = await desktopApp.evaluate(({ nativeImage }) => {
    const pixels = Buffer.alloc(900 * 700 * 4);
    for (let index = 0, seed = 1; index < pixels.length; index += 1) {
      seed = (seed * 48271) % 2147483647;
      pixels[index] = index % 4 === 3 ? 255 : seed % 256;
    }
    return nativeImage.createFromBitmap(pixels, { width: 900, height: 700 }).toPNG().toString('base64');
  });
  expect(imageBase64.length).toBeGreaterThan(1024 * 1024);
  const file = path.join(artifacts, 'inline-image.md');
  await fs.writeFile(file, `Before the figure.\n\n![Inline figure](data:image/png;base64,${imageBase64})\n\nAfter the figure.\n`);
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(({ dialog }, selectedFile) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFile] });
  }, file);
  await desktopWindow.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => desktopWindow.evaluate(async () =>
    (await window.electronAPI!.invoke('load_import_overview', {})).latest_result?.result_status
  )).toBe('imported');
  const imported = await desktopWindow.evaluate(async () =>
    (await window.electronAPI!.invoke('load_import_overview', {})).latest_result?.node_id);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id!), imported);
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await expect(editor).toContainText('After the figure.');
  await expect(editor).not.toContainText('base64');
  const image = desktopWindow.getByRole('img', { name: 'Inline figure', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => {
    const rendered = element as HTMLImageElement;
    return { complete: rendered.complete, width: rendered.naturalWidth, height: rendered.naturalHeight };
  })).toEqual({ complete: true, width: 900, height: 700 });
  await desktopWindow.locator('.prompt-editor-host .cm-md-image-surface-block').first().click({ button: 'right' });
  await expect(desktopWindow.getByRole('menuitem', { name: 'Excerpt image' })).toBeVisible();
  const screenshot = path.join(artifacts, 'markdown-inline-image-menu.png');
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('markdown-inline-image-menu', { path: screenshot });
});

function noisePng(app: ElectronApplication, width: number, height: number) {
  return app.evaluate(({ nativeImage }, size) => {
    const pixels = Buffer.alloc(size.width * size.height * 4);
    for (let index = 0, seed = size.width; index < pixels.length; index += 1) {
      seed = (seed * 48271) % 2147483647;
      pixels[index] = index % 4 === 3 ? 255 : seed % 256;
    }
    return nativeImage.createFromBitmap(pixels, { width: size.width, height: size.height }).toPNG().toString('base64');
  }, { width, height });
}

async function expectImageWithMenu(page: Page, name: string, width: number, height: number) {
  const image = page.getByRole('img', { name, exact: true });
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => {
    const rendered = element as HTMLImageElement;
    return { complete: rendered.complete, width: rendered.naturalWidth, height: rendered.naturalHeight };
  })).toEqual({ complete: true, width, height });
  // The region overlay sits above the picture, so right-click the surface that owns both.
  await page.locator('.prompt-editor-host .cm-md-image-surface-block', { has: image }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Excerpt image' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Excerpt image' })).toBeHidden();
}

test('imports all three inline image forms with a highlight in place and repeats without change', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const artifacts = path.resolve('.tmp/artifacts/T899/final');
  await fs.mkdir(artifacts, { recursive: true });
  const png = (width: number, height: number) => noisePng(desktopApp, width, height);
  const big = await png(900, 700);
  const reference = await png(300, 200);
  const raw = await png(320, 240);
  expect(big.length).toBeGreaterThan(1024 * 1024);
  const file = path.join(artifacts, 'inline-forms.md');
  await fs.writeFile(file, [
    '# Inline forms', `![Big figure](data:image/png;base64,${big})`, '![Reference figure][pic]',
    `<img src="data:image/png;base64,${raw}" alt="Raw figure">`, 'Keep ==this sentence== marked.',
    `[pic]: data:image/png;base64,${reference}`, ''
  ].join('\n\n'));
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(({ dialog }, selectedFile) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFile] });
  }, file);
  const runImport = () => desktopWindow.evaluate(async () =>
    window.electronAPI!.invoke('run_text_file_import', { highlight_policy: 'adopt' }));
  const first = await runImport();
  expect(first?.result_status).toBe('imported');
  const nodeId = first!.node_id!;
  const stored = async (id: string) => (await loadNodeDocument(desktopWindow, id))?.content ?? '';
  const content = await stored(nodeId);
  expect(content).not.toContain('base64');
  expect(content.match(/asset:\/\/[a-f0-9]{64}\.png/g)).toHaveLength(3);

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId);
  await expectImageWithMenu(desktopWindow, 'Big figure', 900, 700);
  await expectImageWithMenu(desktopWindow, 'Reference figure', 300, 200);
  await expectImageWithMenu(desktopWindow, 'Raw figure', 320, 240);
  const highlight = desktopWindow.locator('.prompt-editor-host .cm-md-highlight', { hasText: 'this sentence' });
  await highlight.scrollIntoViewIfNeeded();
  await expect(highlight).toHaveText('this sentence');
  const screenshot = path.join(artifacts, 'inline-forms.png');
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('inline-forms', { path: screenshot });

  const second = await runImport();
  // A hand-picked file is never source tracked: repeating it adds a topic and leaves the first one alone.
  expect(second?.result_status).not.toBe('failed');
  expect(await stored(nodeId)).toBe(content);
  expect(await stored(second!.node_id!)).toBe(content);
});
