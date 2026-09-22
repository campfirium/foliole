import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('a failed cold document read exposes retry and recovers the saved body', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{
      content: 'Saved body survives a read failure.',
      id: 'document-read-retry', kind: 'topic', title: 'Document read retry'
    }], { persist: true });
  });
  await desktopWindow.getByRole('treeitem', { name: 'Document read retry', exact: true }).click();
  await expect(desktopWindow.locator('.cm-content')).toContainText('Saved body survives a read failure.');
  await desktopApp.evaluate(({ ipcMain }) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const probe = globalThis as typeof globalThis & { documentReadFailures?: number };
    probe.documentReadFailures = 0;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', (event, request) => {
      if (request.command === 'load_node_document' && request.args?.nodeId === 'document-read-retry') {
        probe.documentReadFailures = (probe.documentReadFailures ?? 0) + 1;
        throw new Error('acceptance_document_read_failed');
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect.poll(() => desktopApp.evaluate(() =>
    (globalThis as typeof globalThis & { documentReadFailures?: number }).documentReadFailures ?? 0
  )).toBeGreaterThan(0);
  const retry = desktopWindow.getByRole('button', { name: /^(Retry|重试)$/ });
  await expect(retry).toBeVisible();
  await desktopWindow.screenshot({ path: testInfo.outputPath('document-read-failure.png') });
  await desktopApp.evaluate(({ ipcMain }) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', (event, request) => handleInvokeRequest(request, { sender: event.sender }));
  });
  await retry.click();
  await expect(desktopWindow.locator('.cm-content')).toContainText('Saved body survives a read failure.');
  await expect(retry).toHaveCount(0);
  await desktopWindow.locator('.cm-content').click();
  await desktopWindow.keyboard.press('End');
  await desktopWindow.keyboard.type(' Edited after retry.');
  await expect(desktopWindow.locator('.cm-content')).toContainText('Edited after retry.');
  await desktopWindow.screenshot({ path: testInfo.outputPath('document-read-recovered.png') });
});
