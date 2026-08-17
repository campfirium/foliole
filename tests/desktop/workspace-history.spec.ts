import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import {
  capturePermanentHistoryState,
  HISTORY_NODE_IDS,
  roundTripStructureCreate,
  roundTripWorkspaceAction,
  runSpecifiedPostpone,
  seedWorkspaceHistory
} from './harness/workspaceHistory';

const EVIDENCE_ROOT = path.resolve('.tmp/artifacts/desktop-acceptance');

async function runDebugAction(page: import('@playwright/test').Page, action: 'deleteNode' | 'shelveNode' | 'unshelveNode', nodeId: string) {
  const result = await page.evaluate(async ({ actionName, targetId }) => {
    const api = window.__folioleWorkspaceDebug;
    return await api?.[actionName]?.(targetId) ?? false;
  }, { actionName: action, targetId: nodeId });
  expect(result).toBe(true);
}

const REVIEW_ACTION_LABELS = {
  Dismiss: /^Dismiss$/,
  Good: /^(Good|良好|好)$/,
  Later: /^Later$/,
  Read: /^Read$/,
  'Show Answer': /^(Show Answer|显示答案|顯示答案)$/,
  Soon: /^Soon$/
} as const;

async function clickReviewAction(
  page: import('@playwright/test').Page,
  title: keyof typeof REVIEW_ACTION_LABELS
) {
  await page.getByRole('button', { name: REVIEW_ACTION_LABELS[title] }).click();
}

async function continueWorkspaceReading(page: import('@playwright/test').Page) {
  const soon = page.getByRole('button', { name: /^Soon$/ });
  if (!await soon.isVisible().catch(() => false)) {
    await page.getByRole('button', {
      name: /^(Continue reading|继续阅读|繼續閱讀)$/
    }).click();
  }
  await expect(soon).toBeVisible();
}

async function enterWorkspaceHistoryFlow(page: import('@playwright/test').Page) {
  const currentNodeId = () => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getReviewSession?.().currentNodeId ?? null);
  const resumeReview = page.getByRole('button', { name: /^(Resume review|继续复习|繼續複習)$/ });
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  const enterFlow = page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ });
  await expect.poll(async () => (await currentNodeId()) === HISTORY_NODE_IDS.review ||
    await resumeReview.isVisible().catch(() => false) ||
    await exitFlow.isVisible().catch(() => false) ||
    await enterFlow.isVisible().catch(() => false)).toBe(true);
  if ((await currentNodeId()) === HISTORY_NODE_IDS.review) return;
  if (await resumeReview.isVisible().catch(() => false)) await resumeReview.click();
  else if (await enterFlow.isVisible().catch(() => false)) await enterFlow.click();
  else if (await page.getByRole('button', { name: REVIEW_ACTION_LABELS['Show Answer'] }).isVisible() &&
    await page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null) === HISTORY_NODE_IDS.review) {
    await expect.poll(currentNodeId).toBe(HISTORY_NODE_IDS.review);
    return;
  } else {
    await exitFlow.click();
    await enterFlow.click();
  }
  await expect.poll(currentNodeId).toBe(HISTORY_NODE_IDS.review);
}

test('keeps every workspace domain in one durable native history', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedWorkspaceHistory(desktopWindow);
  await enterWorkspaceHistoryFlow(desktopWindow);

  await clickReviewAction(desktopWindow, 'Show Answer');
  await roundTripWorkspaceAction(desktopWindow, 'Grade Review', () => clickReviewAction(desktopWindow, 'Good'));
  await continueWorkspaceReading(desktopWindow);

  const createdNodeId = await roundTripStructureCreate(desktopWindow, async () => {
    const nodeId = await desktopWindow.evaluate(() =>
      window.__folioleWorkspaceDebug?.createRootNode?.('History created topic', 'topic') ?? null);
    expect(nodeId).toBeTruthy();
    return nodeId!;
  });

  await roundTripWorkspaceAction(desktopWindow, 'Soon Topic', () => clickReviewAction(desktopWindow, 'Soon'));
  expect(await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug?.getWorkspaceStructureHistory?.().redoStack ?? []
  )).toEqual([]);

  await roundTripWorkspaceAction(desktopWindow, 'Shelve Topic', () =>
    runDebugAction(desktopWindow, 'shelveNode', HISTORY_NODE_IDS.lifecycle));
  await continueWorkspaceReading(desktopWindow);
  await roundTripWorkspaceAction(desktopWindow, 'Later Topic', () => clickReviewAction(desktopWindow, 'Later'));
  await roundTripWorkspaceAction(desktopWindow, 'Unshelve Topic', () =>
    runDebugAction(desktopWindow, 'unshelveNode', HISTORY_NODE_IDS.lifecycle));
  await continueWorkspaceReading(desktopWindow);
  await roundTripWorkspaceAction(desktopWindow, 'Read Topic', () => clickReviewAction(desktopWindow, 'Read'));
  await roundTripWorkspaceAction(desktopWindow, 'Delete Item', () =>
    runDebugAction(desktopWindow, 'deleteNode', HISTORY_NODE_IDS.deleteItem));
  await continueWorkspaceReading(desktopWindow);
  await roundTripWorkspaceAction(desktopWindow, 'Postpone Topic', () => runSpecifiedPostpone(desktopWindow));
  await roundTripWorkspaceAction(desktopWindow, 'Delete Topic', () =>
    runDebugAction(desktopWindow, 'deleteNode', HISTORY_NODE_IDS.deleteTopic));
  await continueWorkspaceReading(desktopWindow);
  await roundTripWorkspaceAction(desktopWindow, 'Dismiss Topic', () => clickReviewAction(desktopWindow, 'Dismiss'));
  await roundTripWorkspaceAction(desktopWindow, 'Delete Folder', () =>
    runDebugAction(desktopWindow, 'deleteNode', HISTORY_NODE_IDS.deleteFolder));

  const durableNodeIds = [
    HISTORY_NODE_IDS.review,
    ...HISTORY_NODE_IDS.reading,
    HISTORY_NODE_IDS.lifecycle,
    HISTORY_NODE_IDS.deleteItem,
    HISTORY_NODE_IDS.deleteTopic,
    HISTORY_NODE_IDS.deleteFolder,
    createdNodeId
  ];
  const durableBeforeReload = await capturePermanentHistoryState(desktopWindow, durableNodeIds);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));
  await expect.poll(() => capturePermanentHistoryState(desktopWindow, durableNodeIds)).toEqual(durableBeforeReload);
  expect(await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug?.getWorkspaceStructureHistory?.() ?? null
  )).toMatchObject({ redoStack: [], undoStack: [] });

  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const screenshotPath = path.join(EVIDENCE_ROOT, `${process.platform}-workspace-history-hidden-native.png`);
  await desktopWindow.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach('workspace-history-hidden-native', { contentType: 'image/png', path: screenshotPath });
});
