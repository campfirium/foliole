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
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('reentry-reading');
  await page.clock.setFixedTime(due);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  const restored = await session(page);
  expect(restored.currentNodeId).toBe('reentry-reading');
  await expect(page.getByRole('button', { name: 'Soon', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Soon', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('reentry-minute');
  await expect(page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ })).toBeVisible();
  const output = path.resolve('.tmp/artifacts/T441/reentry-native');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'due-reentry.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(restored, null, 2));
});

test('rebuilds the learning day before the first action while Flow stays open, then reloads saved facts', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const boundary = new Date();
  boundary.setHours(4, 0, 0, 0);
  if (boundary.getTime() <= Date.now()) boundary.setDate(boundary.getDate() + 1);
  const before = new Date(boundary.getTime() - 1);
  const created = new Date(boundary.getTime() - 86_400_000).toISOString();
  await page.clock.install({ time: before });
  await page.clock.setFixedTime(before);
  await page.evaluate(async stamp => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const settings = await window.electronAPI.invoke('load_review_scheduler_settings', {});
    await window.electronAPI.invoke('save_review_scheduler_settings', { settings: { ...settings, newDayStartsAtHour: 4 } });
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'day-first', kind: 'topic', title: 'Day first', content: 'First readable day topic', createdAt: stamp },
      { id: 'day-second', kind: 'topic', title: 'Day second', content: 'Second readable day topic', createdAt: stamp }
    ], { persist: true });
  }, created);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBeTruthy();
  const yesterday = await session(page);
  const target = yesterday.currentNodeId!;
  await page.clock.setFixedTime(boundary);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(async () => (await session(page)).daily?.dayKey).toBe(boundary.toISOString());
  expect(yesterday.daily!.dayKey).not.toBe(boundary.toISOString());
  const output = path.resolve('.tmp/artifacts/T441/day-boundary-native');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'attempt.json'), JSON.stringify({ yesterday, after: await session(page) }, null, 2));
  await expect.poll(async () => (await session(page)).readTopicCount).toBe(1);
  const today = await session(page);
  expect(today.currentNodeId).not.toBe(target);
  const saved = await page.evaluate(async id => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return snapshot.nodesById[id]!.reading;
  }, target);
  expect(saved?.lastHandledAt).toBe(boundary.toISOString());
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeEnabled();
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe(today.currentNodeId);
  expect((await session(page)).readTopicCount).toBe(1);
  const reloaded = await page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.reading, target);
  expect(reloaded).toEqual(saved);
  await page.screenshot({ path: path.join(output, 'reloaded-today.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ yesterday, today, saved, reloaded }, null, 2));
});
