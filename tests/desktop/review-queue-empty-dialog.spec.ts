import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.lab/atlas/0active/review-queue-empty-dialog-hidden.png');

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
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Leave Flow|Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible().catch(() => false)) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
}

test('clicking the empty review queue action opens a desktop dialog', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await exitFlowIfActive(desktopWindow);
  await seedEmptyReviewQueueWorkspace(desktopWindow);

  await desktopWindow.waitForFunction(() => {
    const reviewAction = Array.from(document.querySelectorAll('button')).find((button) =>
      /^(Review queue empty|复习队列为空|Enter Flow|进入 Flow)$/.test(button.getAttribute('aria-label') ?? '')
    );
    reviewAction?.click();
    return Boolean(reviewAction);
  });

  const dialog = desktopWindow.getByRole('dialog', { name: /^All clear for now\.$/ });
  await expect(dialog).toBeVisible();
  await expect(desktopWindow.getByText(/Flow has an unavailable topic|Flow 中有不可用主题/)).toHaveCount(0);
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});
