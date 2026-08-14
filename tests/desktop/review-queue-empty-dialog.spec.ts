import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/review-queue-empty-dialog-hidden.png');
const MODE_UNAVAILABLE_SCREENSHOT_PATH = path.resolve('.tmp/artifacts/review-mode-unavailable-hidden.png');
const MODE_UNAVAILABLE_HOVER_SCREENSHOT_PATH = path.resolve('.tmp/artifacts/review-mode-unavailable-hover-hidden.png');

async function waitForGuidedStartup(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.waitForFunction(() => globalThis.window.__folioleWorkspaceDebug?.listNodes().some(
    (node) => /^(Welcome to Foliole|欢迎使用 Foliole)$/.test(node.title)
  ));
  await expect(desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ })).toBeVisible();
}

async function seedEmptyReviewQueueWorkspace(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.evaluate(async () => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      {
        content: '',
        id: 'empty-review-topic',
        kind: 'topic',
        title: 'Empty Review Queue Topic'
      }
    ], { persist: false });
  });
  await desktopWindow.waitForFunction(() =>
    globalThis.window.__folioleWorkspaceDebug?.listNodes().some((node) => node.id === 'empty-review-topic')
  );
}

async function exitFlowIfActive(desktopWindow: import('@playwright/test').Page) {
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible().catch(() => false)) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
}

test('clicking the empty review queue action opens a workspace notice', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await waitForGuidedStartup(desktopWindow);
  await exitFlowIfActive(desktopWindow);
  await seedEmptyReviewQueueWorkspace(desktopWindow);

  await desktopWindow.waitForFunction(() => {
    const reviewAction = Array.from(document.querySelectorAll('button')).find((button) =>
      /^(Review queue empty|复习队列为空|Enter Flow|进入 Flow)$/.test(button.getAttribute('aria-label') ?? '')
    );
    reviewAction?.click();
    return Boolean(reviewAction);
  });

  const notice = desktopWindow.getByTestId('review-queue-empty-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('All clear for now.');
  await expect(desktopWindow.getByRole('dialog', { name: /^All clear for now\.$/ })).toHaveCount(0);
  await expect(desktopWindow.getByText(/Flow has an unavailable topic|Flow 中有不可用主题/)).toHaveCount(0);
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});

test('an unavailable mode stays out of the active Flow session', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await waitForGuidedStartup(desktopWindow);
  await exitFlowIfActive(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      {
        content: 'Reading remains after review work is clear.',
        id: 'review-mode-fallback-reading',
        kind: 'topic',
        title: 'Review Mode Fallback Reading'
      }
    ], { persist: false });
  });

  await desktopWindow.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ }).click();
  await expect(desktopWindow.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /^(Read|阅读)$/ })).toBeVisible();

  await desktopWindow.getByRole('button', { name: /^(Change session mode|更改会话模式)$/ }).click();
  await desktopWindow.getByRole('menuitem', { name: /Reading only|仅阅读/ }).click();
  const readingOnlyMode = desktopWindow.getByRole('button', { name: /Reading only|仅阅读/ });
  await expect(readingOnlyMode).toBeVisible();
  await readingOnlyMode.click();
  await desktopWindow.getByRole('menuitem', { name: /Review and reading|复习和阅读/ }).click();
  await expect(desktopWindow.getByRole('button', { name: /^(Change session mode|更改会话模式)$/ })).toBeVisible();

  await desktopWindow.getByRole('button', { name: /^(Change session mode|更改会话模式)$/ }).click();
  const reviewFirst = desktopWindow.getByRole('menuitem', { name: /Review first|优先复习/ });
  await expect(reviewFirst).toHaveAttribute('data-unavailable', 'true');
  const reviewFirstLabel = reviewFirst.locator('[data-mode-label="true"]');
  const restingColor = await reviewFirstLabel.evaluate((element) => getComputedStyle(element).color);
  await reviewFirst.hover();
  await expect.poll(() => reviewFirstLabel.evaluate((element) => getComputedStyle(element).color)).toBe(restingColor);
  await mkdir(path.dirname(MODE_UNAVAILABLE_HOVER_SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: MODE_UNAVAILABLE_HOVER_SCREENSHOT_PATH });
  await reviewFirst.click();

  await expect(desktopWindow.getByText(/Nothing is available to review in Flow|Flow 中没有可复习内容/)).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /^(Read|阅读)$/ })).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /^(Continue|继续)$/ })).toHaveCount(0);
  await expect(desktopWindow.getByRole('button', { name: /^(Change session mode|更改会话模式)$/ })).toBeVisible();
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window.__folioleWorkspaceDebug?.getReviewSession?.().currentNodeId ?? null
  )).toBe('review-mode-fallback-reading');
  await mkdir(path.dirname(MODE_UNAVAILABLE_SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: MODE_UNAVAILABLE_SCREENSHOT_PATH });
});
