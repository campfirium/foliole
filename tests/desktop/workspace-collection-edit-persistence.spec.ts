import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER = 'collection-metadata-folder';
const PLAIN = 'collection-metadata-plain';
const HEADER = 'collection-metadata-header';
const BOM = 'collection-metadata-bom';
const SAVED_TITLE = 'Collection metadata results';
const PLAIN_BODY = 'Complete plain article body.';
const HEADER_BODY = '---\nauthor: Ada\ncollections:\n  - "Guide"\n---\nComplete header article body.';
const BOM_BODY = '\ufeff---\r\nauthor: Ada\r\ncollections:\r\n  - "Guide"\r\n---\r\nComplete 中😀 body.\r\n';
const TITLES = {
  [PLAIN]: 'Plain collection article', [HEADER]: 'Header collection article', [BOM]: 'BOM collection article'
};

function virtualTree(page: Page) {
  return page.getByRole('tree', { name: /^(Virtual folder tree|虚拟文件夹树)$/ });
}

async function seedCollectionWorkspace(page: Page) {
  await page.evaluate(async ({ folder, plain, header, bom, plainBody, headerBody, bomBody }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: folder, kind: 'folder', title: 'Collection metadata folder', content: '' },
      { id: plain, parentNodeId: folder, title: 'Plain collection article', content: plainBody },
      { id: header, parentNodeId: folder, title: 'Header collection article', content: headerBody },
      { id: bom, parentNodeId: folder, title: 'BOM collection article', content: bomBody }
    ], { persist: true });
  }, { folder: FOLDER, plain: PLAIN, header: HEADER, bom: BOM,
    plainBody: PLAIN_BODY, headerBody: HEADER_BODY, bomBody: BOM_BODY });
  await page.reload();
  await expectWorkspaceShell(page);
  await virtualTree(page).getByRole('treeitem', { name: /^(Virtual|虚拟)$/ }).click();
  await page.getByRole('searchbox', { name: /^(Search topics to save as list|搜索主题并保存为列表)$/ }).fill(SAVED_TITLE);
  await page.getByRole('button', { name: /^(Save search|保存搜索)$/ }).click();
  await expect(virtualTree(page).getByRole('treeitem', { name: SAVED_TITLE, exact: true })).toBeVisible();
  await page.evaluate(async title => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot', {});
    const node = Object.values(snapshot!.nodesById).find(value => value.title === title)!;
    // Prepare the existing collection-filter data format through the production write path.
    await window.electronAPI.invoke('update_node_content', {
      nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind, title: node.title,
      content: '', reveal: null, createdAt: node.createdAt, updatedAt: new Date().toISOString(),
      isTitleManual: true, virtualFilter: {
        version: 1, match: 'all', conditions: [{ field: 'collection', operator: 'equals', value: 'Guide' }]
      }
    });
  }, SAVED_TITLE);
  await page.reload();
  await expectWorkspaceShell(page);
  const persisted = await page.evaluate(() => window.electronAPI.invoke('load_workspace_list_snapshot', {}));
  expect(persisted!.nodesById[PLAIN]).toMatchObject({ collections: [], authorText: null });
  for (const id of [HEADER, BOM]) expect(persisted!.nodesById[id]).toMatchObject({ collections: ['Guide'] });
  expect(Object.values(persisted!.nodesById).find(node => node.title === SAVED_TITLE)?.virtualFilter).toEqual({
    version: 1, match: 'all', conditions: [{ field: 'collection', operator: 'equals', value: 'Guide' }]
  });
}

async function expectCollectionMembers(page: Page, ids: string[]) {
  await virtualTree(page).getByRole('treeitem', { name: SAVED_TITLE, exact: true }).click();
  const list = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  for (const id of [PLAIN, HEADER, BOM]) {
    await expect(list.getByRole('treeitem', { name: TITLES[id], exact: true })).toHaveCount(ids.includes(id) ? 1 : 0);
  }
}

async function replaceBody(page: Page, nodeId: string, title: string, content: string) {
  await page.getByRole('treeitem', { name: 'Collection metadata folder', exact: true }).click();
  const list = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await list.getByRole('treeitem', { name: title, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe(nodeId);
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeVisible();
  const original = await loadNodeDocument(page, nodeId);
  await expect.poll(() => page.evaluate(() => window.__folioleDebug!.getEditorContent('prompt-editor'))).toBe(original?.content);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(content);
  await page.getByRole('treeitem', { name: 'Collection metadata folder', exact: true }).click();
  await expect.poll(async () => (await loadNodeDocument(page, nodeId))?.content).toBe(content);
  await expect(list.getByRole('treeitem', { name: title, exact: true })).toBeVisible();
}

test('updates saved collection membership when edited headers are added and removed', async ({ desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await seedCollectionWorkspace(page);
  await expectCollectionMembers(page, [HEADER, BOM]);
  const addedBody = `---\nauthor: Ada\ncollections:\n  - "Guide"\n---\n${PLAIN_BODY}`;
  await replaceBody(page, PLAIN, 'Plain collection article', addedBody);
  await expectCollectionMembers(page, [PLAIN, HEADER, BOM]);
  await replaceBody(page, HEADER, 'Header collection article', 'Complete header article body.');
  const metadata = await page.evaluate(async nodeId => {
    const full = await window.electronAPI.invoke('load_workspace_list_snapshot', {});
    const scoped = await window.electronAPI.invoke('load_workspace_list_projection', {
      nodeIds: [nodeId], structure: false, libraryScope: full!.libraryScope!
    });
    return [full!.nodesById[nodeId], scoped!.nodesById[nodeId]];
  }, HEADER);
  for (const node of metadata) expect(node).toMatchObject({ authorText: null, collections: [] });
  await expectCollectionMembers(page, [PLAIN, BOM]);
  await replaceBody(page, PLAIN, 'Plain collection article', PLAIN_BODY);
  await replaceBody(page, HEADER, 'Header collection article', HEADER_BODY);
  await expectCollectionMembers(page, [HEADER, BOM]);
  await page.reload();
  await expectWorkspaceShell(page);
  await expectCollectionMembers(page, [HEADER, BOM]);
  for (const [id, content] of [[PLAIN, PLAIN_BODY], [HEADER, HEADER_BODY], [BOM, BOM_BODY]]) {
    expect((await loadNodeDocument(page, id!))?.content).toBe(content);
  }
  await testInfo.attach('collection-membership-after-reopen', {
    contentType: 'image/png', body: await page.screenshot()
  });
});

test('removes a header-free article from saved collection results before reload', async ({ desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await seedCollectionWorkspace(page);
  await expectCollectionMembers(page, [HEADER, BOM]);
  await replaceBody(page, HEADER, 'Header collection article', 'Complete header article body.');
  const snapshot = await page.evaluate(() => window.electronAPI.invoke('load_workspace_list_snapshot', {}));
  expect(snapshot!.nodesById[HEADER]).toMatchObject({ authorText: null, collections: [] });
  await expectCollectionMembers(page, [BOM]);
  expect((await loadNodeDocument(page, HEADER))?.content).toBe('Complete header article body.');
  expect((await loadNodeDocument(page, BOM))?.content).toBe(BOM_BODY);
  await testInfo.attach('removed-collection-before-reload', {
    contentType: 'image/png', body: await page.screenshot()
  });
});
