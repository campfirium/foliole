import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/workspace-home-navigation-hidden-native.png');
const VIRTUAL_SCREENSHOT_PATH = path.resolve('.tmp/artifacts/workspace-virtual-root-hidden-native.png');
const NODE_LIST_PANEL_NAME = /^(Node list panel|主题列表面板)$/;

async function seedLongFolderList(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const folders = Array.from({ length: 60 }, (_, index) => ({
      content: '',
      id: `section-scroll-folder-${index}`,
      kind: 'folder' as const,
      parentNodeId: null,
      reveal: null,
      title: `Section scroll folder ${index}`
    }));
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      ...folders,
      { id: 'section-scroll-topic', kind: 'topic', title: 'Section scroll topic', content: 'Topic body', parentNodeId: folders[0]!.id }
    ], { persist: false });
  });
}

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
  const homeRow = folderPanel.getByRole('treeitem', { name: /^(Home|材料)$/ });
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

test('keeps section entries reachable in a long folder list', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const folderPanel = desktopWindow.getByRole('complementary', { name: NODE_LIST_PANEL_NAME });
  const homeRow = folderPanel.getByRole('treeitem', { name: /^(Home|材料)$/ });
  await seedLongFolderList(desktopWindow);
  const scroll = folderPanel.locator('.app-scrollbar');
  const virtual = folderPanel.getByRole('treeitem', { name: /^(Virtual|虚拟|索引)$/ });
  await expect(homeRow).toBeInViewport();
  await expect(virtual).not.toBeInViewport();

  await scroll.hover();
  await desktopWindow.mouse.wheel(0, 800);
  await expect(homeRow).not.toBeInViewport();
  await virtual.scrollIntoViewIfNeeded();
  const published = folderPanel.getByRole('treeitem', { name: /^(Published|发布)$/ });
  await virtual.press('Enter');
  await expect(published).toHaveCount(0);
  await virtual.press('Enter');
  await published.scrollIntoViewIfNeeded();
  await expect(published).toBeInViewport();
  await expect.poll(() => published.evaluate(row => {
    const bounds = row.getBoundingClientRect();
    return row.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  })).toBe(true);
  await expect(desktopWindow.getByRole('region', { name: /^(Virtual search|虚拟搜索)$/ })).toHaveCount(0);
  await desktopWindow.screenshot({ path: VIRTUAL_SCREENSHOT_PATH });
  await testInfo.attach('workspace-virtual-root-screenshot', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });
  await homeRow.scrollIntoViewIfNeeded();
  const count = homeRow.locator('.node-tree-row-text[aria-hidden="true"]');
  await expect(count).toBeVisible();
  const expandedCount = await count.boundingBox();
  await homeRow.click();
  const inbox = folderPanel.getByRole('treeitem', { name: /^(Inbox|收件箱)$/ });
  await expect(inbox).toHaveCount(0);
  await expect.poll(() => count.boundingBox().then(box => box?.x)).toBe(expandedCount?.x);
  await homeRow.click();
  await expect(inbox).toBeInViewport();
  await expect.poll(() => count.boundingBox().then(box => box?.x)).toBe(expandedCount?.x);
});
