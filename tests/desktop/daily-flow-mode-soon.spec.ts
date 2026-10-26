import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const session = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
async function mode(page: Page, name: RegExp) {
  const before = (await session(page)).daily!.revision;
  const reveal = page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByRole('button', { name: /^(Change session mode|Session mode:)/ }).click();
  await page.getByRole('menuitem', { name }).click();
  await expect.poll(async () => (await session(page)).daily!.revision).toBeGreaterThan(before);
}

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b', 'review-1', 'review-2'].map(id => ({ id: `mode-${id}`,
      kind: id.startsWith('review') ? 'item' : 'topic', title: `Mode ${id}`, content: `Readable body ${id}`,
      reveal: id.startsWith('review') ? 'Answer' : null, reading: null,
      review: id.startsWith('review') ? { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 } : null
    })), { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (!node.id.startsWith('mode-') && (node.kind === 'topic' || node.kind === 'item')) {
        await window.__folioleWorkspaceDebug!.deleteNode(node.id);
      }
    }
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
}

test('keeps ordered reading Soon through review-only grading and renderer restart', async ({ desktopWindow: page }) => {
  await prepare(page);
  await mode(page, /Reading only/);
  await expect.poll(async () => (await session(page)).queueNodeIds.length).toBe(2);
  const initial = await session(page);
  const [first, second] = initial.queueNodeIds;
  await page.getByRole('button', { name: 'Soon', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(second);
  await page.getByRole('button', { name: 'Soon', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(first);
  await mode(page, /Review and reading/);
  await mode(page, /Review first/);
  await expect.poll(async () => (await session(page)).currentNodeId).toMatch(/^mode-review-/);
  const graded = (await session(page)).currentNodeId;
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect.poll(async () => (await session(page)).reviewedItemCount).toBe(1);
  expect((await session(page)).currentNodeId).not.toBe(graded);
  await mode(page, /Review and reading/);
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(first);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(first);
  const restored = await session(page);
  expect(restored.queueNodeIds).toEqual([]);
  expect(restored.soonNodeIds).toEqual([second]);
  expect(restored.readTopicCount).toBe(2);
  expect(restored.reviewedItemCount).toBe(2);
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.getWorkspaceStructureHistory().undoStack)).toEqual([]);
  const output = path.resolve('.tmp/artifacts/T441/mode-soon-native');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'restored.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ initial, restored }, null, 2));
});
