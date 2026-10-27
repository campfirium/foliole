import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('imports a saved non-UTF-8 page and keeps its text readable after reload', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const artifacts = path.resolve('.tmp/artifacts/T514');
  await fs.mkdir(artifacts, { recursive: true });
  const file = path.join(artifacts, 'international-page.html');
  const body = '日本 — café 한국 中文';
  const bytes = Buffer.concat([
    Buffer.from('<html><head><meta charset=Shift_JIS></head><body><p>'),
    Buffer.from('93fa967b', 'hex'), Buffer.from('</p></body></html>')
  ]);
  await fs.writeFile(file, bytes);
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(({ dialog }, selectedFile) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFile] });
  }, file);
  await desktopWindow.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const overview = await window.electronAPI!.invoke('load_import_overview', {});
    return overview.latest_result?.result_status;
  })).toBe('imported');
  const first = await desktopWindow.evaluate(async () => {
    const overview = await window.electronAPI!.invoke('load_import_overview', {});
    return overview.latest_result;
  });
  const imported = first?.node_id;
  expect(imported).toBeTruthy();
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug!.openNode(nodeId!), imported);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('日本');
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug!.openNode(nodeId!), imported);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('日本');
  expect(await fs.readFile(file)).toEqual(bytes);

  await fs.writeFile(file, `<html><head><meta charset=utf-8></head><body><p>${body}</p></body></html>`);
  await desktopWindow.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => desktopWindow.evaluate(async () =>
    (await window.electronAPI!.invoke('load_import_overview', {})).latest_result?.import_id
  )).not.toBe(first?.import_id);
  const second = await desktopWindow.evaluate(async () =>
    (await window.electronAPI!.invoke('load_import_overview', {})).latest_result?.node_id);
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug!.openNode(nodeId!), second);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText(body);
  const screenshot = path.join(artifacts, 'html-encoding-reading.png');
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('html-encoding-reading', { path: screenshot });
});
