import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
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
