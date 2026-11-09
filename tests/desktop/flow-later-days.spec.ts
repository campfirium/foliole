import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { resetSeededDailyFlow } from './dailyFlowFixture.test-support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const delayName = /Custom Later interval|Later 自定义间隔/;
const output = path.resolve('.tmp/artifacts/T749');

async function seedDueTopic(page: Page, topicId: string, createdAt: string) {
  await page.evaluate(async ({ id, stamp }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const nodeIds = Object.values(snapshot.nodesById)
      .filter(node => node.kind === 'topic' || node.kind === 'item').map(node => node.id);
    if (nodeIds.length) await window.electronAPI.invoke('soft_delete_nodes', { nodeIds, deletedAt: stamp });
    await window.electronAPI.invoke('create_topic', {
      nodeId: id, kind: 'topic', parentNodeId: null, title: 'Fixed Later topic', content: 'Topic to postpone',
      isTitleManual: true, anchorLink: null, reveal: null, position: null, createdAt: stamp, updatedAt: stamp,
      nodeOrder: [...snapshot.nodeOrder, id]
    });
  }, { id: topicId, stamp: createdAt });
}

test('saves a fixed Later delay and applies it once from the Flow toolbar', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.setFixedTime(now);
  const topicId = 'fixed-later-topic';
  const createdAt = new Date(now.getTime() - 86_400_000).toISOString();
  await seedDueTopic(page, topicId, createdAt);
  await resetSeededDailyFlow(desktopApp);
  await page.reload();
  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: 'Review', exact: true }).click();
  const input = settings.getByRole('spinbutton', { name: delayName });
  await expect(input).toHaveValue('0');
  await input.fill('3');
  await expect.poll(() => page.evaluate(async () => {
    const settings = await window.electronAPI.invoke('load_review_scheduler_settings');
    return settings.readingLaterDays;
  })).toBe(3);
  await mkdir(output, { recursive: true });
  await settings.locator('[data-settings-search-row-id="review-reading-later"]')
    .evaluate(row => row.scrollIntoView({ block: 'center' }));
  await settings.screenshot({ path: path.join(output, 'later-settings.png') });

  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  const later = page.getByRole('button', { name: 'Later', exact: true });
  await expect(later).toBeVisible();
  await later.hover();
  await expect(page.getByRole('tooltip')).toContainText('Appears again after the specified interval.');
  await expect(page.getByRole('tooltip')).toContainText('You have read part of it and want to continue in 3 days (custom).');
  await page.screenshot({ path: path.join(output, 'fixed-later-action.png') });
  await later.click();
  const savedReading = () => page.evaluate(async id => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot');
    return snapshot.nodesById[id]?.reading;
  }, topicId);
  const due = new Date(now.getTime() + 3 * 86_400_000);
  await expect.poll(savedReading).toMatchObject({
    nextAt: due.toISOString(),
    lastHandledAt: createdAt,
    repetitionCount: 0,
    intervalDurationMs: 0
  });
  await page.clock.setFixedTime(due);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(savedReading).toMatchObject({
    repetitionCount: 1,
    intervalDurationMs: 86_400_000,
    nextAt: new Date(due.getTime() + 86_400_000).toISOString()
  });
});
