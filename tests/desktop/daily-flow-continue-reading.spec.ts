import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T441/continue-reading-native');
const session = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'continue-review', kind: 'item', title: 'Review before reading', content: 'Review question', reveal: 'Review answer',
        review: { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0, stability: 0,
          difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 } },
      { id: 'continue-reading', kind: 'topic', title: 'Continue reading topic', content: 'Readable continuation body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('continue-reading');
  expect((await session(page)).cycle?.clearedAt).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Continue reading', exact: true })).toHaveCount(0);
}

test('automatically crosses Queue clear into readable content and restores it on reload', async ({ desktopWindow: page }) => {
  await prepare(page);
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('continue-reading');
  expect((await session(page)).cycle?.clearedAt).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Continue reading', exact: true })).toHaveCount(0);
  const saved = await session(page);
  expect(saved.cycle?.clearedAt).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Queue clear', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeEnabled();
  await expect(page.getByText('Readable continuation body', { exact: true })).toBeVisible();
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'continued.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('continue-reading');
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeEnabled();
  await expect(page.getByText('Readable continuation body', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'restored.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ saved, restored: await session(page) }, null, 2));
});
