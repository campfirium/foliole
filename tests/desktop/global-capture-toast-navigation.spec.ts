import { test, expect, type Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

const PIVOT_NODE_ID = 'desktop-global-capture-pivot';
const TARGET_NODE_ID = 'desktop-global-capture-target';
const TOAST_TARGET_NODE_ID = 'desktop-global-capture-toast-target';

type DesktopSession = Awaited<ReturnType<typeof launchDesktopSession>>;

async function seedGlobalCaptureNodes(page: Page) {
  return page.evaluate(async ({ pivotNodeId, targetNodeId, toastTargetNodeId }) => {
    const api = window.__folioleWorkspaceDebug;
    if (!api?.seedNodes) {
      return { ok: false, reason: 'missing-workspace-debug-bridge' };
    }
    await api.seedNodes([
      { content: '# Pivot\n\nBefore navigation.', id: pivotNodeId, title: 'Global Capture Pivot' },
      { content: '# Target\n\nAfter navigation.', id: targetNodeId, title: 'Global Capture Target' },
      { content: '# Toast Target\n\nAfter toast click.', id: toastTargetNodeId, title: 'Global Capture Toast Target' }
    ], { persist: true });
    return {
      activeNodeId: api.getActiveNodeId?.() ?? null,
      ok: true
    };
  }, { pivotNodeId: PIVOT_NODE_ID, targetNodeId: TARGET_NODE_ID, toastTargetNodeId: TOAST_TARGET_NODE_ID });
}

async function installGlobalCaptureProbe(page: Page) {
  return page.evaluate(() => {
    const debugWindow = window as Window & {
      __globalCaptureNavigateProbe?: string | null;
      __globalCaptureNavigateProbeUnlisten?: (() => void) | null;
    };
    debugWindow.__globalCaptureNavigateProbe = null;
    debugWindow.__globalCaptureNavigateProbeUnlisten = window.electronAPI?.onGlobalCaptureNavigate?.((payload) => {
      debugWindow.__globalCaptureNavigateProbe = payload.nodeId;
    }) ?? null;
    return Boolean(debugWindow.__globalCaptureNavigateProbeUnlisten);
  });
}

async function sendGlobalCaptureNavigation(session: DesktopSession) {
  await session.electronApp.evaluate(async ({ BrowserWindow }, targetNodeId) => {
    const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
    if (windows.length === 0) {
      throw new Error('missing main window');
    }
    windows.forEach((window) => {
      window.webContents.send('foliole:global-capture-navigate', { nodeId: targetNodeId });
    });
  }, TARGET_NODE_ID);
}

async function showAndClickGlobalCaptureToast(session: DesktopSession) {
  const toastPage = await session.electronApp.evaluate(async ({ BrowserWindow }, toastTargetNodeId) => {
    const toastWindow = new BrowserWindow({
      focusable: false,
      frame: false,
      height: 120,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: `${process.cwd()}\\electron\\globalCaptureToastPreload.cjs`,
        sandbox: true
      },
      width: 360
    });
    await toastWindow.loadURL(`data:text/html;charset=utf-8,${
      encodeURIComponent('<button class="toast" data-clickable="true" onclick="window.globalCaptureToast?.open()">Open</button>')
    }`);
    toastWindow.webContents.send('foliole:global-capture-toast:target', { nodeId: toastTargetNodeId });
    toastWindow.showInactive();
    toastWindow.setIgnoreMouseEvents(false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return BrowserWindow.getAllWindows()
      .filter((window) => !window.isDestroyed())
      .map((window) => ({
        id: window.webContents.id,
        title: window.getTitle(),
        url: window.webContents.getURL()
      }));
  }, TOAST_TARGET_NODE_ID);

  const toastWindow = toastPage.find((window) => window.url.startsWith('data:text/html'));
  expect(toastWindow, JSON.stringify(toastPage, null, 2)).toBeTruthy();
  const toastRendererPage = session.electronApp.windows().find((windowPage) =>
    windowPage.url().startsWith('data:text/html')
  );
  expect(toastRendererPage).toBeTruthy();
  await expect.poll(async () => toastRendererPage?.evaluate(() =>
    Boolean(window.globalCaptureToast)
  )).toBe(true);
  await toastRendererPage?.evaluate(() => window.globalCaptureToast?.open());
  await toastRendererPage?.locator('.toast').click();
}

async function expectCapturedTarget(page: Page, targetNodeId: string) {
  await expect.poll(async () => page.evaluate(() =>
    (window as Window & { __globalCaptureNavigateProbe?: string | null }).__globalCaptureNavigateProbe ?? null
  )).toBe(targetNodeId);
  await expect.poll(async () => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  )).toBe(targetNodeId);
}

test('opens the clipped target from the global capture toast navigation route', async ({ browserName }) => {
  void browserName;
  const session = await launchDesktopSession();
  try {
    const page = session.firstWindow;
    const seeded = await seedGlobalCaptureNodes(page);
    expect(seeded).toMatchObject({ ok: true });
    const bridgeReady = await installGlobalCaptureProbe(page);
    expect(bridgeReady).toBe(true);

    await sendGlobalCaptureNavigation(session);
    await expectCapturedTarget(page, TARGET_NODE_ID);
    await expect.poll(async () => page.evaluate((targetNodeId) =>
      window.__folioleWorkspaceDebug?.getNode?.(targetNodeId)?.title ?? null,
    TARGET_NODE_ID)).toBe('Global Capture Target');

    await showAndClickGlobalCaptureToast(session);
    await expectCapturedTarget(page, TOAST_TARGET_NODE_ID);
  } finally {
    await session.close();
  }
});
