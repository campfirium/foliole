import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { resetSeededDailyFlow } from './dailyFlowFixture.test-support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T732-1/native');

async function seedTopics(page: Page) {
  await page.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await api.deleteNode(node.id);
    }
    await api.seedNodes(['a', 'b'].map(id => ({ id: `continuity-${id}`, kind: 'topic',
      title: `Continuity ${id}`, content: `Original body ${id}`, createdAt: '2026-01-01T00:00:00.000Z' })), { persist: true });
  });
}

async function observeContinuity(page: Page) {
  const root = page.locator('[data-panel-content-root="review-queue"]');
  await root.evaluate(element => {
    const facts = { samples: [] as { at: number; count: number }[], running: true };
    const read = () => facts.samples.push({ at: performance.now(), count: element.querySelectorAll('ol button').length });
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, subtree: true });
    const frame = () => { read(); if (facts.running) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    Object.assign(element, { continuity: { facts, observer } });
  });
  return root;
}

test('keeps Flow through native body and title edits and applies a persisted queue removal', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'review-queue');
  });
  await page.reload();
  await expectWorkspaceShell(page);
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.setFixedTime(now);
  await seedTopics(page);
  await resetSeededDailyFlow(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('continuity-a'));
  fs.mkdirSync(output, { recursive: true });
  const list = page.getByRole('list', { name: 'Flow items', exact: true });
  await expect(list.getByRole('button', { name: 'Continuity a', exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Continuity b', exact: true })).toBeVisible();
  const before = await page.evaluate(stamp => window.electronAPI.invoke('read_daily_flow_view',
    { now: stamp, mode: 'recommended', includeEntries: true }), now.toISOString());
  const root = await observeContinuity(page);
  const editor = page.getByRole('textbox', { name: 'Prompt editor', exact: true });
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
  await page.keyboard.insertText(' Added continuous body.');
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).focus();
  await expect.poll(() => page.evaluate(async () =>
    (await window.electronAPI.invoke('load_node_document', { nodeId: 'continuity-a' }))?.content))
    .toContain('Added continuous body.');
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.updateNodeTitle('continuity-a', 'Renamed continuity'))).toBe(true);
  await expect(list.getByRole('button', { name: 'Renamed continuity', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () =>
    (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById['continuity-a']?.title)).toBe('Renamed continuity');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const samples = await root.evaluate(element => {
    const state = (element as HTMLElement & { continuity: { facts: { running: boolean; samples: { at: number; count: number }[] }; observer: MutationObserver } }).continuity;
    state.facts.running = false;
    state.observer.disconnect();
    return state.facts.samples;
  });
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter(sample => sample.count === 0)).toEqual([]);
  const afterEdit = await page.evaluate(stamp => window.electronAPI.invoke('read_daily_flow_view',
    { now: stamp, mode: 'recommended', includeEntries: true }), now.toISOString());
  expect(afterEdit).toEqual(before);
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'after-edit.png') });
  await page.evaluate(() => window.__folioleWorkspaceDebug!.deleteNode('continuity-b'));
  await expect(list.getByRole('button', { name: 'Continuity b', exact: true })).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Renamed continuity', exact: true })).toBeVisible();
  const afterDelete = await page.evaluate(stamp => window.electronAPI.invoke('read_daily_flow_view',
    { now: stamp, mode: 'recommended', includeEntries: true }), now.toISOString());
  expect(afterDelete.status).toBe('ready');
  if (afterDelete.status === 'ready') expect(afterDelete.nodeIds).toEqual(['continuity-a']);
  await page.screenshot({ path: path.join(output, 'after-delete.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ before, afterEdit, afterDelete, samples }, null, 2));
});
