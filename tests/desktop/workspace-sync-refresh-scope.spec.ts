import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('sync state changes do not reload the node directory, while node changes do', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(({ ipcMain }) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const counter = globalThis as typeof globalThis & { __workspaceListReads?: number };
    counter.__workspaceListReads = 0;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', (event, request) => {
      if (request.command === 'load_workspace_list_snapshot') counter.__workspaceListReads! += 1;
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });

  const sendApplied = (appliedNodeIds: string[], appliedObjectIds: string[]) => desktopApp.evaluate(
    ({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('foliole:workspace-sync-applied', payload);
    }, { appliedNodeIds, appliedObjectIds, appliedReviewOpIds: [] }
  );
  await sendApplied([], [
    'setting:user_space:windows:desktop:*:app_settings',
    'node_open_state:node-1',
    'view_state:session_resume:windows:desktop:Maci:active_node'
  ]);
  await desktopWindow.waitForTimeout(1500);
  expect(await desktopApp.evaluate(() => (globalThis as typeof globalThis & { __workspaceListReads?: number }).__workspaceListReads)).toBe(0);

  await sendApplied(['node-1'], []);
  await expect.poll(() => desktopApp.evaluate(
    () => (globalThis as typeof globalThis & { __workspaceListReads?: number }).__workspaceListReads
  )).toBe(1);
});
