import process from 'node:process';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, normalizeDesktopWindow, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TARGET_ID = 'playwright-reading-progress-relaunch';
const TARGET_TITLE = 'Playwright Reading Progress Relaunch';

async function seedScrollableDocument(windowPage: Awaited<ReturnType<typeof launchDesktopSession>>['firstWindow']) {
  await windowPage.evaluate(async ({ id, title }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const longLines = Array.from(
      { length: 320 },
      (_, index) => `Line ${index + 1} keeps the relaunch reading progress document long enough to restore scroll.`
    );
    await api?.seedNodes?.([
      {
        content: longLines.join('\n'),
        id,
        kind: 'topic',
        title
      }
    ]);
    await api?.openNode?.(id);
  }, { id: TARGET_ID, title: TARGET_TITLE });
}

async function openScrollableDocument(windowPage: DesktopSession['firstWindow']) {
  await seedScrollableDocument(windowPage);
  await windowPage.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  return windowPage.evaluate(() => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return api?.getActiveNodeId?.() ?? null;
  });
}

async function scrollAndCollect(windowPage: DesktopSession['firstWindow'], nodeId: string) {
  await windowPage.locator('.prompt-editor-host .cm-scroller').hover();
  await windowPage.mouse.wheel(0, 3500);
  await expect.poll(() => windowPage.evaluate(id =>
    window.__folioleWorkspaceDebug?.getNodeViewState?.(id)?.readingOffset ?? 0, nodeId
  )).toBeGreaterThan(0);

  return windowPage.evaluate((targetNodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      nodeViewState: api?.getNodeViewState?.(targetNodeId) ?? null,
      scrollHeight: scroller?.scrollHeight,
      scrollTop: scroller?.scrollTop
    };
  }, nodeId);
}

async function collectRestoredState(windowPage: DesktopSession['firstWindow'], nodeId: string) {
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

test('persists normal reading scroll position across relaunch', async ({ desktopSession, desktopWindow }, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;

  try {
    await expectWorkspaceShell(desktopWindow);
    const nodeId = await openScrollableDocument(desktopWindow);
    expect(nodeId).toBeTruthy();

    const beforeRestart = await scrollAndCollect(desktopWindow, nodeId as string);
    await testInfo.attach('reading-progress-before-relaunch', {
      body: JSON.stringify(beforeRestart, null, 2),
      contentType: 'application/json'
    });

    expect(beforeRestart.activeNodeId).toBe(nodeId);
    expect(beforeRestart.scrollTop).toBeGreaterThan(0);
    expect(beforeRestart.nodeViewState?.scrollTop).toBeGreaterThan(0);

    await closeDesktopApplication(desktopSession.electronApp);

    secondSession = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot }
    });
    await normalizeDesktopWindow(secondSession as DesktopSession);
    await expectWorkspaceShell(secondSession.firstWindow);
    const afterRelaunch = await collectRestoredState(secondSession.firstWindow, nodeId as string);
    await testInfo.attach('reading-progress-after-relaunch', {
      body: JSON.stringify(afterRelaunch, null, 2),
      contentType: 'application/json'
    });

    expect(afterRelaunch.activeNodeId).toBe(nodeId);
    expect(afterRelaunch.nodeViewState?.scrollTop).toBeGreaterThan(0);
    expect(afterRelaunch.nodeViewState?.readingOffset).toBe(beforeRestart.nodeViewState?.readingOffset);
    expect(afterRelaunch.scrollTop).toBeGreaterThan(0);
  } finally {
    await secondSession?.close();
  }
});
