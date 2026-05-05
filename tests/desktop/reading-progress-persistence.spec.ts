import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

import { expectWorkspaceShell } from './harness/settings';

const TARGET_TITLE = 'GTD 项目管理方法';

async function openScrollableDocument(windowPage: Awaited<ReturnType<typeof launchDesktopSession>>['firstWindow']) {
  await windowPage.getByRole('treeitem', { name: new RegExp(TARGET_TITLE) }).first().click();
  await expect(windowPage.getByRole('button', { name: TARGET_TITLE, exact: true })).toBeVisible();
  await windowPage.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  return windowPage.evaluate(() => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return api?.getActiveNodeId?.() ?? null;
  });
}

async function scrollAndCollect(windowPage: Awaited<ReturnType<typeof launchDesktopSession>>['firstWindow'], nodeId: string) {
  return windowPage.evaluate(async (targetNodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    if (!(scroller instanceof HTMLElement)) {
      return { reason: 'missing-scroller' };
    }
    scroller.scrollTop = Math.max(0, scroller.scrollHeight * 0.68);
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1800));
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      nodeViewState: api?.getNodeViewState?.(targetNodeId) ?? null,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop
    };
  }, nodeId);
}

async function collectRestoredState(windowPage: Awaited<ReturnType<typeof launchDesktopSession>>['firstWindow'], nodeId: string) {
  await expect(windowPage.getByRole('button', { name: TARGET_TITLE, exact: true })).toBeVisible();
  await windowPage.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  await windowPage.waitForTimeout(800);
  return windowPage.evaluate((targetNodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      nodeViewState: api?.getNodeViewState?.(targetNodeId) ?? null,
      scrollTop: scroller?.scrollTop ?? null
    };
  }, nodeId);
}

test('persists normal reading scroll position across relaunch', async ({ browserName }, testInfo) => {
  void browserName;
  let firstSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;

  try {
    firstSession = await launchDesktopSession();
    await expectWorkspaceShell(firstSession.firstWindow);
    const nodeId = await openScrollableDocument(firstSession.firstWindow);
    expect(nodeId).toBeTruthy();

    const beforeRestart = await scrollAndCollect(firstSession.firstWindow, nodeId as string);
    await testInfo.attach('reading-progress-before-relaunch', {
      body: JSON.stringify(beforeRestart, null, 2),
      contentType: 'application/json'
    });

    expect(beforeRestart.activeNodeId).toBe(nodeId);
    expect(beforeRestart.scrollTop).toBeGreaterThan(0);
    expect(beforeRestart.nodeViewState?.scrollTop).toBeGreaterThan(0);

    await firstSession.close();
    firstSession = null;

    secondSession = await launchDesktopSession();
    await expectWorkspaceShell(secondSession.firstWindow);
    const afterRelaunch = await collectRestoredState(secondSession.firstWindow, nodeId as string);
    await testInfo.attach('reading-progress-after-relaunch', {
      body: JSON.stringify(afterRelaunch, null, 2),
      contentType: 'application/json'
    });

    expect(afterRelaunch.activeNodeId).toBe(nodeId);
    expect(afterRelaunch.nodeViewState?.scrollTop).toBeGreaterThan(0);
    expect(afterRelaunch.scrollTop).toBeGreaterThan(0);
  } finally {
    await secondSession?.close();
    await firstSession?.close();
  }
});
