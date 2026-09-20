import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('shows failed workspace reads and recovers through the existing retry action', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(({ ipcMain }) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    let failuresRemaining = 2;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', (event, request) => {
      if (request.command === 'load_workspace_list_snapshot' && failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw new Error(`acceptance_workspace_read_failed_${2 - failuresRemaining}`);
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
  await desktopWindow.reload();
  const error = desktopWindow.getByRole('alert').filter({ hasText: 'acceptance_workspace_read_failed' });
  await expect(error).toBeVisible();
  await expect(desktopWindow.locator('#boot-skeleton')).toBeHidden();
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.isHydrated())).toBe(false);
  await testInfo.attach('workspace-read-failure', {
    body: await error.screenshot({ path: path.join(process.cwd(), '.tmp/artifacts/architecture-audit/hydration-failure.png') }),
    contentType: 'image/png'
  });
  const retry = desktopWindow.getByRole('button', { name: /^(Retry|重试)$/ });
  await retry.click();
  await expect(error).toContainText('acceptance_workspace_read_failed_2');
  await retry.click();
  await expect(error).toHaveCount(0);
  await expectWorkspaceShell(desktopWindow);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.isHydrated())).toBe(true);
});
