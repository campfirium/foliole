import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T441/soon-native');

test('keeps waiting Soon before later reading across refresh and reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b', 'later'].map(id => ({ id: `soon-${id}`,
      kind: 'topic', title: `Soon ${id}`, content: `Reading body ${id}`, review: null, reading: null,
      shelvedAt: id === 'later' ? '2026-04-08T00:00:00.000Z' : null
    })), { persist: true });
  });
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('button', { name: /^Change session mode$/ }).click();
  await page.getByRole('menuitem', { name: /Reading only/ }).click();
  const original = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().queueNodeIds);
  expect(original).toHaveLength(2);
  for (const id of original) {
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(id);
    await page.getByRole('button', { name: 'Soon', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Queue clear', exact: true })).toBeVisible();
  await page.evaluate(() => window.__folioleWorkspaceDebug!.unshelveNode('soon-later'));
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getNode('soon-later')?.shelvedAt)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(original[0]);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(original[1]);
  await expect(page.getByRole('button', { name: 'Queue clear', exact: true })).toBeVisible();
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'before-reload.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(original[1]);
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'after-reload.png') });
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('soon-later');
});
