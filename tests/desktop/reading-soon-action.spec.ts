import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function collectReviewState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const activeNodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    const activeNode = activeNodeId ? globalThis.window?.__folioleWorkspaceDebug?.getNode?.(activeNodeId) : null;
    const reviewSession = globalThis.window?.__folioleWorkspaceDebug?.getReviewSession?.() ?? null;
    const toolbarText = document.querySelector('[aria-label="Reading review actions"]')?.textContent ?? '';
    return {
      activeNodeId,
      activeReading: activeNode?.reading ?? null,
      activeTitle: activeNode?.title ?? null,
      reviewSession,
      toolbarText
    };
  });
}

test('clicking Soon advances the guided reading review action in the desktop runtime', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('button', { name: 'Enter Flow' }).click();
  await expect(desktopWindow.getByRole('button', { name: 'Read', exact: true })).toBeVisible();
  await desktopWindow.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(desktopWindow.getByRole('button', { name: 'Soon', exact: true })).toBeVisible();
  await desktopWindow.waitForTimeout(500);

  const before = await collectReviewState(desktopWindow);
  await testInfo.attach('reading-soon-before', {
    body: JSON.stringify(before, null, 2),
    contentType: 'application/json'
  });

  await desktopWindow.getByRole('button', { name: 'Soon', exact: true }).click();
  await expect.poll(async () => (await collectReviewState(desktopWindow)).activeNodeId).not.toBe(before.activeNodeId);

  const after = await collectReviewState(desktopWindow);
  await testInfo.attach('reading-soon-after', {
    body: JSON.stringify(after, null, 2),
    contentType: 'application/json'
  });
  expect(after.activeNodeId).not.toBe(before.activeNodeId);
  expect(after.reviewSession?.soonNodeIds ?? []).toContain(before.activeNodeId);
  expect(after.toolbarText).toContain('Soon');
});
