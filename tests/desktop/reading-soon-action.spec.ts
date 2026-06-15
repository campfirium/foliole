import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function collectReviewState(page: Page) {
  return page.evaluate(() => {
    const activeNodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    const activeNode = activeNodeId ? globalThis.window?.__folioleWorkspaceDebug?.getNode?.(activeNodeId) : null;
    const reviewSession = globalThis.window?.__folioleWorkspaceDebug?.getReviewSession?.() ?? null;
    const toolbarText = document.querySelector('[aria-label="Reading review actions"], [aria-label="阅读复习操作"]')?.textContent ?? '';
    return {
      activeNodeId,
      activeReading: activeNode?.reading ?? null,
      activeTitle: activeNode?.title ?? null,
      reviewSession,
      toolbarText
    };
  });
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
}

function reviewActionsToolbar(page: Page) {
  return page.locator('[aria-label="Reading review actions"], [aria-label="阅读复习操作"]');
}

async function enterFlowIfNeeded(page: Page) {
  const enterFlow = page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ });
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await enterFlow.isVisible().catch(() => false)) {
    await enterFlow.click();
  } else {
    await expect(exitFlow).toBeVisible();
  }
}

async function pushCurrentTopicSoon(page: Page, testInfo: TestInfo) {
  const before = await collectReviewState(page);
  await testInfo.attach('reading-soon-before', {
    body: JSON.stringify(before, null, 2),
    contentType: 'application/json'
  });

  await page.getByRole('button', { name: 'Soon', exact: true }).click();
  await expect.poll(async () => (await collectReviewState(page)).activeNodeId).not.toBe(before.activeNodeId);

  const after = await collectReviewState(page);
  await testInfo.attach('reading-soon-after', {
    body: JSON.stringify(after, null, 2),
    contentType: 'application/json'
  });
  expect(after.activeNodeId).not.toBe(before.activeNodeId);
  expect(after.reviewSession?.soonNodeIds ?? []).toContain(before.activeNodeId);
  expect(after.toolbarText).toContain('Soon');
}

async function clickSoonUntilQueueClear(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await collectReviewState(page);
    if (current.reviewSession?.currentNodeId && current.reviewSession.queueNodeIds.length === 0) {
      break;
    }
    const activeBeforeSoon = current.activeNodeId;
    await page.getByRole('button', { name: 'Soon', exact: true }).click();
    await expect.poll(async () => (await collectReviewState(page)).activeNodeId).not.toBe(activeBeforeSoon);
  }
}

async function assertQueueClearStage(page: Page, testInfo: TestInfo) {
  const queueClear = await collectReviewState(page);
  await testInfo.attach('reading-soon-queue-clear', {
    body: JSON.stringify(queueClear, null, 2),
    contentType: 'application/json'
  });
  expect(queueClear.reviewSession?.currentNodeId).toBeTruthy();
  expect(queueClear.reviewSession?.queueNodeIds ?? []).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Queue clear' })).toBeVisible();
  await expect(page.getByTestId('app-runtime-notice')).toHaveCount(0);
  await attachScreenshot(page, testInfo, 'reading-soon-queue-clear-screenshot');
}

async function readUntilAllClear(page: Page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const state = await collectReviewState(page);
    if (!state.reviewSession?.currentNodeId) {
      break;
    }
    await page.getByRole('button', { name: 'Read', exact: true }).click();
    await page.waitForTimeout(100);
  }
}

async function assertAllClearNotice(page: Page, testInfo: TestInfo) {
  const allClearNotice = page.getByTestId('app-runtime-notice');
  await expect(allClearNotice).toHaveText('All clear for now.');
  await expect(reviewActionsToolbar(page)).toHaveCount(0);
  await attachScreenshot(page, testInfo, 'reading-soon-all-clear-screenshot');
}

test('clicking Soon advances the guided reading review action in the desktop runtime', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await enterFlowIfNeeded(desktopWindow);
  await expect(desktopWindow.getByRole('button', { name: 'Read', exact: true })).toBeVisible();
  await desktopWindow.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(desktopWindow.getByRole('button', { name: 'Soon', exact: true })).toBeVisible();
  await desktopWindow.waitForTimeout(500);

  await pushCurrentTopicSoon(desktopWindow, testInfo);
  await clickSoonUntilQueueClear(desktopWindow);
  await assertQueueClearStage(desktopWindow, testInfo);
  await readUntilAllClear(desktopWindow);
  await assertAllClearNotice(desktopWindow, testInfo);

  await desktopWindow.getByRole('button', { name: /^(Review queue empty|复习队列为空|Enter Flow|进入 Flow)$/ }).click();
  await expect(desktopWindow.getByTestId('app-runtime-notice')).toHaveText('All clear for now.');
  await expect(reviewActionsToolbar(desktopWindow)).toHaveCount(0);
});
