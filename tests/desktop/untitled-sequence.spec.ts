import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const POISONED_TITLE = 'Untitled 1123123123';
const SCREENSHOT = path.resolve('.tmp/artifacts/untitled-sequence-hidden-native.png');

async function expectHydrated(page: Page) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));
}

async function expectTitle(page: Page, nodeId: string, title: string) {
  await expect.poll(() => page.evaluate((id) =>
    window.__folioleWorkspaceDebug?.getNode?.(id)?.title ?? null, nodeId
  )).toBe(title);
}

async function createRoot(page: Page, title: string) {
  const id = await page.evaluate(() => window.__folioleWorkspaceDebug!.createRootNode('', 'topic'));
  expect(id).toBeTruthy();
  await expectTitle(page, id!, title);
  return id!;
}

async function createAndRemoveSeries(page: Page) {
  const parentId = await createRoot(page, 'Untitled');
  await page.locator(`[role="treeitem"][data-node-id="${parentId}"]`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Create Topic|创建主题)$/ }).click();
  const childId = await page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId());
  expect(childId).toBeTruthy();
  await expectTitle(page, childId!, 'Untitled 1');

  const rootIds = [parentId];
  for (let index = 2; index <= 5; index += 1) {
    rootIds.push(await createRoot(page, `Untitled ${index}`));
  }
  expect(await page.evaluate((id) => window.__folioleWorkspaceDebug!.deleteNode(id), parentId)).toBe(true);
  rootIds.shift();
  rootIds.push(await createRoot(page, 'Untitled 6'));
  for (const id of rootIds) {
    expect(await page.evaluate((nodeId) => window.__folioleWorkspaceDebug!.deleteNode(nodeId), id)).toBe(true);
  }
}

test('Untitled titles share one library sequence and restart after the series is removed', async ({
  desktopWindow, desktopSession
}, testInfo) => {
  await expectHydrated(desktopWindow);
  const manualId = await createRoot(desktopWindow, 'Untitled');
  expect(await desktopWindow.evaluate(({ id, title }) =>
    window.__folioleWorkspaceDebug!.updateNodeTitle(id, title),
  { id: manualId, title: POISONED_TITLE })).toBe(true);
  await desktopWindow.reload();
  await expectHydrated(desktopWindow);
  await createAndRemoveSeries(desktopWindow);

  let restarted: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    restarted = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    });
    const page = restarted.firstWindow;
    await expectHydrated(page);
    await expectTitle(page, manualId, POISONED_TITLE);
    await createRoot(page, 'Untitled');
    await mkdir(path.dirname(SCREENSHOT), { recursive: true });
    await page.screenshot({ fullPage: true, path: SCREENSHOT });
    await testInfo.attach('untitled-sequence-hidden-native', { contentType: 'image/png', path: SCREENSHOT });
  } finally {
    await restarted?.close();
  }
});
