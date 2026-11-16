import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ids = { deleted: 'trash-move-deleted', source: 'trash-move-source', target: 'trash-move-target' };
const titles = { deleted: 'Deleted empty folder', source: 'Moving folder', target: 'Receiving folder' };

async function expectDeletedFolder(page: Page) {
  await expect.poll(() => page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.trashed, ids.deleted)).toBe(true);
  await expect(page.getByRole('treeitem', { name: titles.deleted, exact: true })).toHaveCount(0);
  const snapshot = await page.evaluate(() => window.electronAPI.invoke('load_workspace_snapshot', {}));
  expect(snapshot!.trashedNodeIds).toContain(ids.deleted);
  expect(snapshot!.nodesById[ids.source]?.parentNodeId).toBe(ids.target);
}

async function dragFolder(page: Page) {
  const source = page.getByRole('treeitem', { name: titles.source, exact: true });
  const target = page.getByRole('treeitem', { name: titles.target, exact: true });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Missing folder rows');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await page.mouse.up();
  await expect.poll(() => page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.parentNodeId, ids.source))
    .toBe(ids.target);
}

test('keeps an empty folder deleted through another folder drop, reload, restart and restoration', async ({
  desktopSession, desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async ({ ids, titles }) => {
    await window.__folioleWorkspaceDebug!.seedNodes(Object.entries(ids).map(([key, id]) => ({
      id, title: titles[key as keyof typeof titles], kind: 'folder' as const, content: ''
    })), { persist: true });
  }, { ids, titles });
  await page.getByRole('treeitem', { name: titles.deleted, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Delete|删除)$/ }).click();
  await expect(page.getByRole('treeitem', { name: titles.deleted, exact: true })).toHaveCount(0);
  await dragFolder(page);
  await expectDeletedFolder(page);
  const evidence = path.resolve('.tmp/artifacts/T786/deleted-folder-after-drop.png');
  await mkdir(path.dirname(evidence), { recursive: true });
  await page.screenshot({ path: evidence });
  await testInfo.attach('deleted-folder-after-drop', { path: evidence, contentType: 'image/png' });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await expectDeletedFolder(page);
  const stateRoot = desktopSession.target.runtimeStateRoot;
  await desktopSession.electronApp.close();
  const reopened = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } });
  try {
    const restarted = reopened.firstWindow;
    await expectWorkspaceShell(restarted);
    await restarted.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
    await expectDeletedFolder(restarted);
    expect(await restarted.evaluate(id => window.__folioleWorkspaceDebug!.restoreNode(id), ids.deleted)).toBe(true);
    await expect(restarted.getByRole('treeitem', { name: titles.deleted, exact: true })).toBeVisible();
    await restarted.reload();
    await expectWorkspaceShell(restarted);
    await expect(restarted.getByRole('treeitem', { name: titles.deleted, exact: true })).toBeVisible();
    await restarted.screenshot({ path: path.resolve('.tmp/artifacts/T786/restored-after-restart.png') });
  } finally { await reopened.close(); }
});
