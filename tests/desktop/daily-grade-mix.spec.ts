import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T441/grade-mix-native');

test('keeps the planned reading after five grades and restores it after renderer reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(Array.from({ length: 15 }, (_, i) => ({
      id: `mix-${i}`, kind: i < 12 ? 'item' as const : 'topic' as const,
      title: `Mixed flow ${i}`, content: `Readable body for mixed flow ${i}`,
      ...(i < 12 ? { reveal: `Answer ${i}`, review: {
        due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0 as const,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0
      } } : {})
    })), { persist: true });
  });
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await expect(page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ })).toBeVisible();
  const initial = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.kind, initial.queueNodeIds[5]!)).toBe('topic');
  for (let step = 0; step < 5; step += 1) {
    expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(initial.queueNodeIds[step]);
    await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
    await page.getByRole('button', { name: /^Good$/ }).click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().reviewedItemCount)).toBe(step + 1);
  }
  const saved = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(saved.currentNodeId).toBe(initial.queueNodeIds[5]);
  expect(saved.queueNodeIds).toEqual(initial.queueNodeIds.slice(5));
  await expect(page.getByRole('button', { name: /^Read$/ })).toBeVisible();
  await expect(page.getByText(`Readable body for mixed flow ${saved.currentNodeId!.replace('mix-', '')}`, { exact: true }).first()).toBeVisible();
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'reading-ready.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(saved.currentNodeId);
  const restored = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(restored.queueNodeIds).toEqual(saved.queueNodeIds);
  expect(restored.reviewedItemCount).toBe(5);
  await expect(page.getByRole('button', { name: /^Read$/ })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'reading-restored.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ initial, saved, restored }, null, 2));
});
