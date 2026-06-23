import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.lab/atlas/0active/flow-preview-day-groups-hidden.png'
);
const RESUME_SCREENSHOT_PATH = path.resolve(
  '.lab/atlas/0active/flow-resume-desktop-hidden.png'
);

test('desktop Flow panel does not show Demo preview day controls in normal runtime', async ({
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);

  const inspector = desktopWindow.getByRole('complementary', {
    name: /Inspector|检查器/
  });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('Flow');
  await expect(inspector.getByLabel(/Demo Flow (notice|提示)/)).toHaveCount(0);
  await expect(inspector.getByText(/Scheduled later|稍后出现/)).toHaveCount(0);
  await expect(inspector.getByText('Day 1')).toHaveCount(0);
  await expect(inspector.getByText('Day 2')).toHaveCount(0);

  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});

test('desktop Resume returns to the current Flow topic', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      {
        content: 'First Flow topic body',
        id: 'desktop-flow-resume-topic-1',
        kind: 'topic',
        title: 'Desktop Flow Resume Topic 1'
      },
      {
        content: 'Second Flow topic body',
        id: 'desktop-flow-resume-topic-2',
        kind: 'topic',
        title: 'Desktop Flow Resume Topic 2'
      }
    ], { persist: false });
  });
  await desktopWindow.waitForFunction(() =>
    globalThis.window.__folioleWorkspaceDebug?.listNodes().some((node) => node.id === 'desktop-flow-resume-topic-2')
  );

  await desktopWindow.waitForFunction(() => {
    const enterFlow = Array.from(document.querySelectorAll('button')).find((button) =>
      /^(Enter Flow|进入 Flow)$/.test(button.getAttribute('aria-label') ?? '')
    );
    enterFlow?.click();
    return Boolean(enterFlow);
  });
  await expect(desktopWindow.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();
  const flowState = await desktopWindow.evaluate(() => ({
    activeNodeId: globalThis.window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
    reviewSession: globalThis.window.__folioleWorkspaceDebug?.getReviewSession?.() ?? null
  }));
  expect(flowState.reviewSession?.currentNodeId).toBeTruthy();

  await desktopWindow.evaluate(async () => {
    await globalThis.window.__folioleWorkspaceDebug?.openNode?.('desktop-flow-resume-topic-2');
  });
  await expect.poll(() =>
    desktopWindow.evaluate(() => globalThis.window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)
  ).toBe('desktop-flow-resume-topic-2');

  await desktopWindow.getByRole('button', { name: /^(Resume review|继续复习)$/ }).click();
  await expect.poll(() =>
    desktopWindow.evaluate(() => globalThis.window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)
  ).toBe(flowState.reviewSession?.currentNodeId);
  await expect(desktopWindow.getByTestId('app-runtime-notice')).toHaveCount(0);
  await desktopWindow.screenshot({ path: RESUME_SCREENSHOT_PATH });
});
