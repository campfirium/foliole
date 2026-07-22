import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ISSUE_FOLDER_ID = 'playwright-review-context-issue';
const REVIEW_TOPIC_ID = 'playwright-review-context-topic';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/review-folder-context-alignment.png');

async function seedCrossFolderReviewContext(page: import('@playwright/test').Page) {
  await page.evaluate(async ({ issueFolderId, reviewTopicId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    if (!api) throw new Error('missing workspace debug bridge');
    await api.seedNodes([
      {
        content: '',
        id: issueFolderId,
        kind: 'folder',
        title: 'Issue'
      },
      {
        content: 'Progressive reading body.',
        id: reviewTopicId,
        kind: 'topic',
        parentNodeId: 'special-inbox',
        reading: {
          intervalDurationMs: 60_000,
          intervalGrowthFactor: 2,
          lastHandledAt: '2026-04-08T00:00:00.000Z',
          nextAt: '2026-04-08T00:00:00.000Z',
          priority: 5,
          readingPosition: 0,
          repetitionCount: 0,
          state: 'active'
        },
        title: 'Progressive Reading Topic'
      }
    ], { persist: false });
    await api.openNode(issueFolderId);
  }, { issueFolderId: ISSUE_FOLDER_ID, reviewTopicId: REVIEW_TOPIC_ID });
}

async function enterFreshFlow(page: import('@playwright/test').Page) {
  const enterFlow = page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ });
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible().catch(() => false)) {
    await exitFlow.click();
  }
  await expect(enterFlow).toBeVisible();
  await enterFlow.click();
}

test('Flow shows the physical folder of the current reading topic', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedCrossFolderReviewContext(desktopWindow);
  await expect(desktopWindow.locator(`[data-node-id="${ISSUE_FOLDER_ID}"][aria-selected="true"]`)).toBeVisible();

  await enterFreshFlow(desktopWindow);

  await expect(desktopWindow.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();
  await expect.poll(() => desktopWindow.evaluate(() => (
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  ))).toBe(REVIEW_TOPIC_ID);
  await expect(desktopWindow.locator('[data-node-id="special-inbox"][aria-selected="true"]')).toBeVisible();
  await expect(desktopWindow.locator(`[data-node-id="${ISSUE_FOLDER_ID}"][aria-selected="true"]`)).toHaveCount(0);
  await expect(desktopWindow.getByRole('navigation', { name: /Breadcrumbs|面包屑/ }).getByRole('button', { name: 'Inbox' })).toBeVisible();

  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  await testInfo.attach('review-folder-context-alignment', {
    body: await fs.promises.readFile(SCREENSHOT_PATH),
    contentType: 'image/png'
  });
});
