import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('keeps a saved page image visible after removing its source directory and reloading', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const artifacts = path.resolve('.tmp/artifacts/T514');
  const source = path.join(artifacts, 'saved-page-source');
  await fs.mkdir(path.join(source, 'page files'), { recursive: true });
  const imageBase64 = await desktopApp.evaluate(({ nativeImage }) => {
    const pixels = Buffer.alloc(320 * 180 * 4).fill(Buffer.from([40, 140, 220, 255]));
    return nativeImage.createFromBitmap(pixels, { width: 320, height: 180 }).toPNG().toString('base64');
  });
  await fs.writeFile(path.join(source, 'page files', 'figure.png'), Buffer.from(imageBase64, 'base64'));
  const file = path.join(source, 'saved-page.html');
  await fs.writeFile(file, Buffer.concat([
    Buffer.from('<html><head><meta charset=Shift_JIS></head><body><p>'),
    Buffer.from('93fa967b', 'hex'),
    Buffer.from(' saved page.</p><img src="page%20files/figure.png" alt="Saved figure"></body></html>')
  ]));
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
  expect(imported).toBeTruthy();
  await fs.rm(source, { recursive: true });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id!), imported);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('日本 saved page.');
  const image = desktopWindow.getByRole('img', { name: 'Saved figure', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => {
    const rendered = element as HTMLImageElement;
    return { complete: rendered.complete, width: rendered.naturalWidth, height: rendered.naturalHeight };
  })).toEqual({ complete: true, width: 320, height: 180 });
  const screenshot = path.join(artifacts, 'html-images-after-source-removal.png');
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('html-images-after-source-removal', { path: screenshot });
});
