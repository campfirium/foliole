import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const topicId = 'immersive-priority-topic';
const itemId = 'immersive-priority-item';

async function seedPriorityFixture(page: Page, review: boolean) {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ topicId, itemId, review }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'priority-parent', kind: 'folder', title: 'Priority parent', content: '', priority: 3 },
      { id: topicId, kind: 'topic', parentNodeId: 'priority-parent', title: 'Priority topic',
        content: 'Priority reading text', priority: null },
      ...(review ? [{ id: itemId, kind: 'item' as const, parentNodeId: topicId, title: 'Priority item',
        content: 'Priority review prompt', reveal: 'Priority review answer', priority: null,
        review: { due: '2026-01-01T00:00:00.000Z', lastReviewAt: null, state: 0 as const,
          stability: 0, stabilityFast: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
      }] : [])
    ], { persist: true });
  }, { topicId, itemId, review });
}

async function expectSidebarsHidden(page: Page) {
  await expect(page.getByRole('toolbar', { name: /^(Left toolbar|左侧工具栏)$/ })).toBeHidden();
  await expect(page.getByRole('complementary', { name: /^(Inspector|检查器)$/ })).toBeHidden();
  await expect(page.getByLabel('Window controls')).toBeHidden();
}

async function verifyPriority(page: Page, id: string, capture: (name: string) => Promise<unknown>) {
  const dialog = page.getByRole('dialog', { name: /Set priority|设置优先级/ });
  await page.keyboard.press('F11');
  await expectSidebarsHidden(page);
  await page.keyboard.press('Control+M');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('3', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('slider')).toHaveValue('3');
  await expectSidebarsHidden(page);
  await capture('current-priority');

  await page.keyboard.press('7');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: /(?:Priority|优先级).*P7/ })).toBeVisible();
  await expectSidebarsHidden(page);
  await capture('applied-priority');

  await page.keyboard.press('Control+M');
  await expect(dialog.getByRole('slider')).toHaveValue('7');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expectSidebarsHidden(page);
  await expect.poll(() => page.evaluate(async (nodeId) => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return snapshot.nodesById[nodeId]?.priority;
  }, id)).toBe(7);
}

test('shows inherited and changed priority in immersive reading', async ({ desktopWindow: page }, info) => {
  await seedPriorityFixture(page, false);
  await page.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), topicId);
  await expect(page.locator('.prompt-editor-host')).toContainText('Priority reading text');
  await verifyPriority(page, topicId, async (name) => {
    await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
  });
});

test('shows inherited and changed priority in immersive review', async ({ desktopApp, desktopWindow: page }, info) => {
  await seedPriorityFixture(page, true);
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(itemId);
  await expect(page.locator('.prompt-editor-host')).toContainText('Priority review prompt');
  await verifyPriority(page, itemId, async (name) => {
    await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
  });
});
