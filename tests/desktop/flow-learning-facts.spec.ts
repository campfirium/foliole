import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const session = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());

test('advances Soon without changing reading facts and restores its successor after reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b', 'c'].map(id => ({
      id: `learning-${id}`, kind: 'topic', title: `Learning ${id}`, content: `Reading body ${id}`,
      createdAt: new Date().toISOString()
    })), { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  const before = await session(page);
  expect(before.currentNodeId).toMatch(/^learning-/);
  const readingBefore = await page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id!)!.reading, before.currentNodeId);
  await page.getByRole('button', { name: 'Soon', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).not.toBe(before.currentNodeId);
  const saved = await session(page);
  expect(saved.currentNodeId).toMatch(/^learning-/);
  expect(saved.readTopicCount).toBe(1);
  expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id!)!.reading, before.currentNodeId)).toEqual(readingBefore);
  const output = path.resolve('.tmp/artifacts/T519/native-soon');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'after-soon.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(saved.currentNodeId);
  expect((await session(page)).readTopicCount).toBe(1);
  await expect(page.getByRole('button', { name: 'Soon', exact: true })).toBeVisible();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ before, saved, restored: await session(page) }, null, 2));
});
