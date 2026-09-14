import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const POISONED_TITLE = 'Untitled 1123123123';
const SCREENSHOT = path.resolve('.tmp/artifacts/untitled-sequence-hidden-native.png');

test('Untitled titles share one library sequence and restart after the series is removed', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));

  const manualId = await desktopWindow.evaluate(async () =>
    window.__folioleWorkspaceDebug?.createRootNode?.('', 'topic') ?? null
  );
  expect(manualId).toBeTruthy();
  expect(await desktopWindow.evaluate(([nodeId, title]) =>
    window.__folioleWorkspaceDebug?.updateNodeTitle?.(nodeId!, title!) ?? false,
  [manualId, POISONED_TITLE])).toBe(true);

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));

  const createdId = await desktopWindow.evaluate(async () =>
    window.__folioleWorkspaceDebug?.createRootNode?.('', 'topic') ?? null
  );
  expect(createdId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId!)?.title ?? null, createdId
  )).toBe('Untitled');

  const parentTreeItem = desktopWindow.locator(`[role="treeitem"][data-node-id="${createdId}"]`);
  await parentTreeItem.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Create Topic|创建主题)$/ }).click();
  const childId = await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  );
  expect(childId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId!)?.title ?? null, childId
  )).toBe('Untitled 1');

  const thirdId = await desktopWindow.evaluate(async () =>
    window.__folioleWorkspaceDebug?.createRootNode?.('', 'topic') ?? null
  );
  expect(thirdId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId!)?.title ?? null, thirdId
  )).toBe('Untitled 2');

  expect(await desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.deleteNode?.(nodeId!) ?? false, createdId
  )).toBe(true);
  expect(await desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.deleteNode?.(nodeId!) ?? false, thirdId
  )).toBe(true);

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));

  const restartedId = await desktopWindow.evaluate(async () =>
    window.__folioleWorkspaceDebug?.createRootNode?.('', 'topic') ?? null
  );
  expect(restartedId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId!)?.title ?? null, restartedId
  )).toBe('Untitled');

  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ fullPage: true, path: SCREENSHOT });
  await testInfo.attach('untitled-sequence-hidden-native', { contentType: 'image/png', path: SCREENSHOT });
});
