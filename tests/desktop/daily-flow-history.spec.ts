import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { runPaletteHistoryCommand } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function prepare(page: Page, kind: 'item' | 'topic') {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async nodeKind => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b'].map(id => ({ id: `delta-${id}`,
      kind: nodeKind, title: `History ${id}`, content: `Readable history body ${id}`,
      reveal: nodeKind === 'item' ? `Answer ${id}` : null, reading: null,
      review: nodeKind === 'topic' ? null : { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
    })), { persist: true });
  }, kind);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  if (kind === 'topic') {
    await page.getByRole('button', { name: 'Change session mode', exact: true }).click();
    await page.getByRole('menuitem', { name: /Reading only/ }).click();
  }
}

const session = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
async function facts(page: Page, id: string) {
  return page.evaluate(async nodeId => {
    const node = (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[nodeId]!;
    return { reading: node.reading, reps: node.review?.reps ?? 0 };
  }, id);
}

async function capture(page: Page, action: string) {
  const output = path.resolve(`.tmp/artifacts/T441/history-native/${action}`);
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'after-redo.png') });
  const saved = await session(page);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(saved.currentNodeId);
  expect((await session(page)).queueNodeIds).toEqual(saved.queueNodeIds);
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.getWorkspaceStructureHistory().undoStack)).toEqual([]);
  await page.screenshot({ path: path.join(output, 'after-reload.png') });
}

for (const action of ['Grade', 'Soon', 'Read', 'Later', 'Dismiss'] as const) {
test(`${action} restores the current item, facts and daily cursor through undo, redo and renderer reload`, async ({ desktopWindow: page }) => {
  await prepare(page, action === 'Grade' ? 'item' : 'topic');
  const initial = await session(page);
  const id = initial.currentNodeId!;
  const before = await facts(page, id);
  if (action === 'Grade') {
    await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
    await page.getByRole('button', { name: 'Good', exact: true }).click();
  } else await page.getByRole('button', { name: action, exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).not.toBe(id);
  const after = await session(page);
  const committed = await facts(page, id);
  const title = action === 'Grade' ? 'Grade Review' : `${action} Topic`;
  await runPaletteHistoryCommand(page, `Undo ${title}`);
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(id);
  expect(await facts(page, id)).toEqual(before);
  await runPaletteHistoryCommand(page, `Redo ${title}`);
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(after.currentNodeId);
  expect(await facts(page, id)).toEqual(committed);
  expect((await session(page)).queueNodeIds).toEqual(after.queueNodeIds);
  await capture(page, action);
});
}

test('replays a Soon and Read chain while preserving the waiting topic', async ({ desktopWindow: page }) => {
  await prepare(page, 'topic');
  const initial = await session(page);
  await page.getByRole('button', { name: 'Soon', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).not.toBe(initial.currentNodeId);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(initial.currentNodeId);
  const after = await session(page);
  await runPaletteHistoryCommand(page, 'Undo Read Topic');
  await expect.poll(async () => (await session(page)).currentNodeId).not.toBe(initial.currentNodeId);
  await runPaletteHistoryCommand(page, 'Undo Soon Topic');
  await expect.poll(async () => (await session(page)).queueNodeIds).toEqual(initial.queueNodeIds);
  await runPaletteHistoryCommand(page, 'Redo Soon Topic');
  await runPaletteHistoryCommand(page, 'Redo Read Topic');
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(after.currentNodeId);
  expect((await session(page)).soonNodeIds).toEqual(after.soonNodeIds);
  await capture(page, 'combined');
});
