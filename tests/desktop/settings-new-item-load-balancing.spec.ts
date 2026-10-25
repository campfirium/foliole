import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, type Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const FIELD_NAME = /^(New item load balancing|新检测项负载均衡)$/;
const REVIEW_CATEGORY = /^(Review|复习)$/;

// Exercise the real desktop bridge and persisted settings through the rendered control.
test('persists the new item balancing window across renderer reload', async ({ desktopWindow }) => {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: REVIEW_CATEGORY }).click();
  await expect(dialog.getByRole('heading', { level: 2, name: REVIEW_CATEGORY })).toBeVisible();
  const input = dialog.getByRole('spinbutton', { name: FIELD_NAME });
  await expect(input).toHaveValue('7');
  await input.fill('1');
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const settings = await window.electronAPI!.invoke('load_review_scheduler_settings') as { newItemLoadBalancingDays: number };
    return settings.newItemLoadBalancingDays;
  })).toBe(1);

  await desktopWindow.reload();
  const reopened = await openSettingsDialog(desktopWindow);
  await reopened.getByRole('button', { name: REVIEW_CATEGORY }).click();
  const restored = reopened.getByRole('spinbutton', { name: FIELD_NAME });
  await expect(restored).toHaveValue('1');
  await restored.fill('99');
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const settings = await window.electronAPI!.invoke('load_review_scheduler_settings') as { newItemLoadBalancingDays: number };
    return settings.newItemLoadBalancingDays;
  })).toBe(99);
  await restored.fill('7');
  await expect(restored).toHaveValue('7');
  await restored.scrollIntoViewIfNeeded();
  await mkdir(path.resolve('.tmp/artifacts/new-item-load-balancing'), { recursive: true });
  await reopened.screenshot({ path: path.resolve('.tmp/artifacts/new-item-load-balancing/settings.png') });
});

async function firstReviewDates(page: Page) {
  return page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot');
    return ['initial-schedule-a', 'initial-schedule-b'].map(id => snapshot?.nodesById[id]?.review?.due ?? null);
  });
}

test('keeps allocated first review dates after renderer reload and application restart', async ({ desktopSession, desktopWindow }) => {
  const expected = await desktopWindow.evaluate(async () => {
    const now = new Date().toISOString();
    const dates = [1, 3].map(days => new Date(Date.now() + days * 86400000).toISOString());
    for (const [index, id] of ['initial-schedule-a', 'initial-schedule-b'].entries()) {
      const snapshot = await window.electronAPI.invoke('load_workspace_snapshot');
      await window.electronAPI.invoke('create_item', {
        nodeId: id, kind: 'item', parentNodeId: 'special-inbox', title: 'First schedule', content: 'Question',
        reveal: 'Answer', isTitleManual: true, anchorLink: null, position: null, createdAt: now, updatedAt: now,
        review: { due: dates[index]!, lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
          elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 },
        nodeOrder: [...(snapshot?.nodeOrder ?? []), id]
      });
    }
    return dates;
  });
  expect(await firstReviewDates(desktopWindow)).toEqual(expected);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  expect(await firstReviewDates(desktopWindow)).toEqual(expected);
  const stateRoot = desktopSession.target.runtimeStateRoot;
  await desktopSession.electronApp.close();
  const reopened = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } });
  try {
    await expectWorkspaceShell(reopened.firstWindow);
    expect(await firstReviewDates(reopened.firstWindow)).toEqual(expected);
  } finally { await reopened.close(); }
});
