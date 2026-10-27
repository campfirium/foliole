import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T536/sidebar-native');

test('prepares the sidebar without starting learning and follows the durable Soon order', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.setFixedTime(now);
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b', 'c'].map(id => ({
      id: `sidebar-${id}`, kind: 'topic', title: `Sidebar ${id}`, content: `Sidebar readable body ${id}`,
      createdAt: '2026-01-01T00:00:00.000Z'
    })), { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  const query = () => page.evaluate(stamp => window.electronAPI.invoke('read_daily_flow_view',
    { now: stamp, mode: 'recommended', includeEntries: true }), now.toISOString());
  await expect.poll(async () => (await query()).status).toBe('ready');
  const prepared = await page.evaluate(stamp => window.electronAPI.invoke('open_daily_flow',
    { now: stamp, mode: 'recommended', prepareOnly: true }), now.toISOString());
  expect(prepared.session.sessionStartedAt).toBeNull();
  expect(prepared.session.currentItemStartedAt).toBeNull();
  const list = page.getByRole('list', { name: 'Flow items', exact: true });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button', { name: /Sidebar a/ })).toBeVisible();
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'prepared.png') });
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().sessionStartedAt)).toBeTruthy();
  await page.getByRole('button', { name: 'Soon', exact: true }).click();
  const current = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  await expect.poll(async () => {
    const value = await query();
    return value.status === 'ready' ? value.revision : 0;
  }).toBeGreaterThan(prepared.session.daily!.revision);
  const view = await query();
  if (view.status !== 'ready') throw new Error('sidebar view unavailable');
  const expectedTitles = await page.evaluate(ids => ids.map(id => window.__folioleWorkspaceDebug!.getNode(id)?.title), view.nodeIds!);
  await expect.poll(async () => list.getByRole('button').allTextContents()).toEqual(expectedTitles);
  await page.screenshot({ path: path.join(output, 'after-soon.png') });
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).click();
  await expect(list).not.toBeVisible();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ prepared, current, view }, null, 2));
});
