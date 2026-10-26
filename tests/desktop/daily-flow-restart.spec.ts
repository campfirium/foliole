import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T441/daily-native');

test('continues the saved daily Flow cursor after reloading the desktop renderer', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') {
        await window.__folioleWorkspaceDebug!.deleteNode(node.id);
      }
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b'].map(id => ({
      id: `daily-${id}`, kind: 'item', title: `Daily ${id}`, content: `Question ${id}`, reveal: `Answer ${id}`,
      priority: 0, review: { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
    })), { persist: true });
  });
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: /^Good$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().reviewedItemCount)).toBe(1);
  const saved = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(saved.daily).toBeDefined();
  expect(saved.currentNodeId).not.toBeNull();
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'before-reload.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const enter = page.getByRole('button', { name: /^Enter Flow$/ });
  await expect(enter).toBeVisible();
  await enter.click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(saved.currentNodeId);
  const restored = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(restored.queueNodeIds).toEqual(saved.queueNodeIds);
  expect(restored.daily?.dayKey).toBe(saved.daily?.dayKey);
  expect(restored.reviewedItemCount).toBe(1);
  await page.screenshot({ path: path.join(output, 'after-reload.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ saved, restored }, null, 2));
});
