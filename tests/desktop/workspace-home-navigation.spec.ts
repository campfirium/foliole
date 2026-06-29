import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.lab/atlas/0active/workspace-home-navigation-hidden-native.png');
const NODE_LIST_PANEL_NAME = /^(Node list panel|主题列表面板)$/;

test('workspace navigation keeps root folders under Home after renderer patch seeding', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      {
        content: '',
        id: 'root-folder-for-home',
        kind: 'folder',
        parentNodeId: null,
        reveal: null,
        title: 'Root Folder For Home'
      }
    ], { persist: false });
  });

  const folderPanel = desktopWindow.getByRole('complementary', { name: NODE_LIST_PANEL_NAME });
  const homeRow = folderPanel.getByRole('treeitem', { name: 'Home', exact: true });
  const rootFolderRow = folderPanel.getByRole('treeitem', { name: 'Root Folder For Home', exact: true });
  await expect(homeRow).toBeVisible();
  await expect(rootFolderRow).toBeVisible();

  const navigationState = await desktopWindow.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug;
    return {
      home: debug?.getNode?.('special-home') ?? null,
      inbox: debug?.getNode?.('special-inbox') ?? null,
      rootFolder: debug?.getNode?.('root-folder-for-home') ?? null,
      visibleOrder: debug?.listNodes?.().map((node) => node.id) ?? []
    };
  });

  await testInfo.attach('workspace-home-navigation-state', {
    body: JSON.stringify(navigationState, null, 2),
    contentType: 'application/json'
  });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('workspace-home-navigation-screenshot', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });

  expect(navigationState.home?.title).toBe('Home');
  expect(navigationState.inbox?.parentNodeId).toBeNull();
  expect(navigationState.rootFolder?.parentNodeId).toBeNull();
  await expect(homeRow).toHaveAttribute('aria-level', '1');
  await expect(rootFolderRow).toHaveAttribute('aria-level', '2');
  expect(navigationState.visibleOrder.slice(0, 3)).toEqual([
    'special-home',
    'special-inbox',
    'special-virtual-root'
  ]);
});
