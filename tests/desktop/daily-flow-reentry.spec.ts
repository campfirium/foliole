import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const session = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());

test('checks minute eligibility on reentry while retaining the current reading', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const now = new Date();
  const due = new Date(now.getTime() + 60_000);
  await page.clock.install({ time: now });
  await page.clock.setFixedTime(now);
  await page.evaluate(async ({ stamp, dueAt }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'reentry-reading', kind: 'topic', title: 'Reentry reading', content: 'Readable current topic', createdAt: stamp },
      { id: 'reentry-minute', kind: 'item', title: 'Reentry minute', content: 'Minute question', reveal: 'Minute answer',
        createdAt: stamp, review: { due: dueAt, lastReviewAt: stamp, state: 1, stability: 0.1,
          difficulty: 4, elapsedDays: 0, scheduledDays: 0, reps: 1, lapses: 0 } }
    ], { persist: true });
  }, { stamp: now.toISOString(), dueAt: due.toISOString() });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('reentry-reading');
  expect((await session(page)).queueNodeIds).not.toContain('reentry-minute');
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('reentry-reading');
  expect((await session(page)).queueNodeIds).not.toContain('reentry-minute');
  await page.clock.setFixedTime(due);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).queueNodeIds).toContain('reentry-minute');
  const restored = await session(page);
  expect(restored.currentNodeId).toBe('reentry-reading');
  await expect(page.getByRole('button', { name: 'Soon', exact: true })).toBeVisible();
  const output = path.resolve('.tmp/artifacts/T441/reentry-native');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'due-reentry.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(restored, null, 2));
});
