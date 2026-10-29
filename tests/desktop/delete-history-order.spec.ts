import path from 'node:path';

import type { Page } from '@playwright/test';

import { focusWorkspace } from './harness/contextualContentHistory';
import { clickNativeHistoryCommand } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ids = { parent: 'delete-order-parent', a: 'delete-order-a', x: 'delete-order-x', b: 'delete-order-b' };

async function showManualOrder(page: Page, expected = [ids.b, ids.a, ids.x]) {
  const column = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  const folder = page.getByRole('region', { name: /^(Folder list view|文件夹列表视图)$/ });
  for (const surface of [column, folder]) {
    await surface.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
    await page.getByRole('menuitem', { name: /^(Manual|手动)$/ }).click();
  }
  await expect.poll(() => column.getByRole('treeitem').evaluateAll(items =>
    items.map(item => item.getAttribute('data-node-id')))).toEqual(expected);
}

test('restores a deleted topic near its original sibling after a parent reorder and retains it after reload', async ({
  desktopApp, desktopWindow: page
}) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ids => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([
      { id: ids.parent, title: 'Delete order folder', kind: 'folder', content: '' },
      ...[ids.a, ids.x, ids.b].map((id, index) => ({ id, parentNodeId: ids.parent,
        title: ['First neighbor', 'Restored topic', 'Second neighbor'][index]!, kind: 'topic' as const,
        content: `# ${id}\n\nRetained document.` }))
    ]);
    await debug.openNode(ids.parent);
    await debug.deleteNode(ids.x);
  }, ids);
  const children = () => page.evaluate(async parent => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    if (!snapshot) throw new Error('workspace_snapshot_missing');
    const order = snapshot.nodesById[parent]?.manualChildOrder ?? snapshot.nodeOrder;
    return order.filter(id => snapshot.nodesById[id]?.parentNodeId === parent &&
      !snapshot.trashedNodeIds.includes(id));
  }, ids.parent);
  await expect.poll(children).toEqual([ids.a, ids.b]);
  await showManualOrder(page, [ids.a, ids.b]);
  await moveSecondBeforeFirst(page);
  await expect.poll(children).toEqual([ids.b, ids.a]);
  await focusWorkspace(page);
  await clickNativeHistoryCommand(desktopApp, page, 'app.undo');
  await expect.poll(children).toEqual([ids.b, ids.a, ids.x]);
  await expect.poll(() => page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.trashed, ids.x)).toBe(false);
  await showManualOrder(page);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T629/delete-order-undo.png') });
  await focusWorkspace(page);
  await clickNativeHistoryCommand(desktopApp, page, 'app.redo');
  await expect.poll(children).toEqual([ids.b, ids.a]);
  await focusWorkspace(page);
  await clickNativeHistoryCommand(desktopApp, page, 'app.undo');
  await expect.poll(children).toEqual([ids.b, ids.a, ids.x]);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(children).toEqual([ids.b, ids.a, ids.x]);
  await showManualOrder(page);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T629/delete-order-reloaded.png') });
});

async function moveSecondBeforeFirst(page: Page) {
  const column = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  const source = column.getByRole('treeitem', { name: 'Second neighbor' }).locator('..');
  const target = column.getByRole('treeitem', { name: 'First neighbor' }).locator('..');
  await expect(source).toHaveAttribute('draggable', 'true');
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('manual order rows unavailable');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 1, { steps: 8 });
  await expect(target).toHaveClass(/border-t-2/);
  await page.mouse.up();
}
