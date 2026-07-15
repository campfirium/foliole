import type { Page } from '@playwright/test';

import { clickWindowsScreenPoint } from '../../scripts/windows/windows-native-mouse-click.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';

const PIVOT_NODE_ID = 'desktop-global-capture-pivot';
const TARGET_NODE_ID = 'desktop-global-capture-target';
const TOAST_TARGET_NODE_ID = 'desktop-global-capture-toast-target';

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

async function clickToast(toastRendererPage: Page, toastInfo: {
  clickPoint: { x: number; y: number };
  hwndHex: string;
}) {
  if (process.platform !== 'win32') {
    await toastRendererPage.locator('.toast').click();
    return;
  }
  clickWindowsScreenPoint({
    hwndHex: toastInfo.hwndHex,
    x: Math.round(toastInfo.clickPoint.x),
    y: Math.round(toastInfo.clickPoint.y)
  });
}

async function showAndClickGlobalCaptureToast(session: DesktopSession) {
  const toastInfo = await session.electronApp.evaluate(async (_, toastTargetNodeId) => {
    const hook = globalThis.__folioleShowGlobalClipDesktopToastForTests;
    if (!hook) {
      throw new Error('missing global capture toast test hook');
    }
    return hook({
      previewTitle: 'Global Capture Toast Target',
      targetNodeId: toastTargetNodeId
    });
  }, TOAST_TARGET_NODE_ID);

  let toastRendererPage: Page | undefined;
  for (let index = 0; index < 30 && !toastRendererPage; index += 1) {
    toastRendererPage = (await Promise.all(session.electronApp.windows().map(async (windowPage) => ({
      count: await windowPage.locator('.toast').count().catch(() => 0),
      windowPage
    })))).find((entry) => entry.count > 0)?.windowPage;
    if (!toastRendererPage) {
      await session.firstWindow.waitForTimeout(100);
    }
  }
  expect(toastRendererPage).toBeTruthy();
  await expect.poll(async () => toastRendererPage?.evaluate(() =>
    Boolean(window.globalCaptureToast)
  )).toBe(true);
  await expect.poll(async () => toastRendererPage?.evaluate(() => {
    const toast = document.querySelector('.toast') as HTMLElement | null;
    return {
      clickable: toast?.dataset.clickable ?? '',
      targetNodeId: toast?.dataset.targetNodeId ?? ''
    };
  })).toEqual({
    clickable: 'true',
    targetNodeId: TOAST_TARGET_NODE_ID
  });
  await toastRendererPage?.bringToFront();
  const toastBox = await toastRendererPage?.locator('.toast').boundingBox();
  expect(toastBox).toBeTruthy();
  const hitDiagnostics = await toastRendererPage?.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    return {
      hitClassName: hit?.className ?? null,
      hitTagName: hit?.tagName ?? null
    };
  }, {
    x: (toastBox?.x ?? 0) + (toastBox?.width ?? 0) / 2,
    y: (toastBox?.y ?? 0) + (toastBox?.height ?? 0) / 2
  });
  if (!hitDiagnostics?.hitTagName) {
    throw new Error(`toast click target is missing: ${JSON.stringify(hitDiagnostics)}`);
  }
  await clickToast(toastRendererPage!, toastInfo);
}

async function maximizeMainWindow(session: DesktopSession) {
  await expect.poll(async () => session.electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      !candidate.isDestroyed() && candidate.webContents.getURL().startsWith('file:')
    );
    if (!window) return false;
    window.maximize();
    return window.isMaximized();
  })).toBe(true);
}

async function expectMainWindowMaximized(session: DesktopSession) {
  await expect.poll(async () => session.electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      !candidate.isDestroyed() && candidate.webContents.getURL().startsWith('file:')
    );
    return window?.isMaximized() ?? false;
  })).toBe(true);
}

async function expectNoVisibleToastWindows(session: DesktopSession) {
  await expect.poll(async () => session.electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((window) =>
      !window.isDestroyed() &&
      window.isVisible() &&
      window.webContents.getURL().startsWith('data:text/html') &&
      decodeURIComponent(window.webContents.getURL()).includes('class="capture-surface toast"')
    ).length
  )).toBe(0);
}

async function expectCapturedTarget(page: Page, targetNodeId: string) {
  await expect.poll(async () => page.evaluate(() =>
    (window as Window & { __globalCaptureNavigateProbe?: string | null }).__globalCaptureNavigateProbe ?? null
  )).toBe(targetNodeId);
  await expect.poll(async () => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  )).toBe(targetNodeId);
}

test('opens the clipped target from the global capture toast navigation route', async ({ desktopSession }) => {
  const session = desktopSession;
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

  await maximizeMainWindow(session);
  await showAndClickGlobalCaptureToast(session);
  await expect.poll(async () => {
    try {
      return await session.electronApp.evaluate(() =>
        globalThis.__folioleGlobalCaptureToastOpenForTests?.nodeId ?? null
      );
    } catch {
      return null;
    }
  }).toBe(TOAST_TARGET_NODE_ID);
  await expectCapturedTarget(page, TOAST_TARGET_NODE_ID);
  await expectMainWindowMaximized(session);
  await expectNoVisibleToastWindows(session);
});
