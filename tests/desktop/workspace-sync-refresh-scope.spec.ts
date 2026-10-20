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

test('a scoped committed creation appears without a complete directory read', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot');
    const now = new Date().toISOString();
    await window.electronAPI.invoke('create_topic', {
      nodeId: 'scoped-sync-topic', kind: 'topic', parentNodeId: null, content: 'Scoped synchronized body',
      title: 'Scoped synchronized article', isTitleManual: true, anchorLink: null, reveal: null,
      position: null, createdAt: now, updatedAt: now, nodeOrder: [...snapshot.nodeOrder, 'scoped-sync-topic']
    });
  });
  await desktopApp.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const { currentLibraryScope } = require(`${process.cwd()}/dist/electron/database/attachmentResourceDescription.js`);
    const { notifyWorkspaceSyncApplied } = require(`${process.cwd()}/dist/electron/sync/workspaceSyncAppliedEvents.js`);
    const counter = globalThis as typeof globalThis & { __scopedReads?: { full: number; scoped: number } };
    counter.__scopedReads = { full: 0, scoped: 0 };
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', (event, request) => {
      if (request.command === 'load_workspace_list_snapshot') counter.__scopedReads!.full += 1;
      if (request.command === 'load_workspace_list_projection') counter.__scopedReads!.scoped += 1;
      return handleInvokeRequest(request, { sender: event.sender });
    });
    notifyWorkspaceSyncApplied({ appliedNodeIds: ['scoped-sync-topic'], appliedObjectIds: ['scoped-sync-topic'],
      appliedReviewOpIds: [], libraryScope: currentLibraryScope(),
      workspaceScope: { kind: 'nodes', nodeIds: ['scoped-sync-topic'], structure: true } });
  });
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug?.getNode('scoped-sync-topic')?.title)).toBe('Scoped synchronized article');
  const reads = await desktopApp.evaluate(() =>
    (globalThis as typeof globalThis & { __scopedReads?: { full: number; scoped: number } }).__scopedReads);
  expect(reads?.full).toBe(0);
  expect(reads?.scoped).toBeGreaterThan(0);
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.openNode('scoped-sync-topic'));
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Scoped synchronized body');
});
