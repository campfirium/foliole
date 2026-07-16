import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Page } from '@playwright/test';

import {
  launchDesktopSession
} from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EVIDENCE_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const TOGGLE_LEFT_PANEL_NAME = /^(Toggle left panel|切换左侧面板)$/;

// SKIP: macOS-only native host acceptance | 2026-07-14 | revive: run on a darwin host
test.skip(process.platform !== 'darwin', 'macOS host acceptance');

async function clickApplicationMenuItem(session: DesktopSession, commandId: string) {
  await session.electronApp.evaluate(({ BrowserWindow, Menu }, id) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(id);
    const window = BrowserWindow.getFocusedWindow();
    if (!item || !window) throw new Error(`missing focused menu command: ${id}`);
    item.click(undefined, window, window.webContents);
  }, commandId);
}

async function readListTitlebarWidth(page: Page) {
  return page.locator('.window-titlebar').evaluate((titlebar) =>
    getComputedStyle(titlebar).getPropertyValue('--workspace-titlebar-list-current-width').trim());
}

async function readNativeTitlebarGeometry(page: Page) {
  return page.evaluate(() => {
    const titlebar = document.querySelector<HTMLElement>('.window-titlebar');
    const documentSurface = document.querySelector<HTMLElement>('[data-workspace-surface-column="document"]');
    const folderSurface = document.querySelector<HTMLElement>('[data-workspace-surface-column="folder"]');
    const leftToggle = document.querySelector<HTMLElement>(
      '.window-titlebar-leading-primary button, .window-titlebar-collapsed-left-action button'
    );
    const railDivider = document.querySelector<HTMLElement>('[data-workspace-surface-divider="rail"]');
    const mainRail = document.querySelector<HTMLElement>('.workspace-region-main-rail');
    const titlebarLeft = titlebar?.getBoundingClientRect().left ?? 0;
    return {
      documentSurfaceLeft: documentSurface
        ? Math.round(documentSurface.getBoundingClientRect().left - titlebarLeft)
        : null,
      folderSurfaceLeft: folderSurface
        ? Math.round(folderSurface.getBoundingClientRect().left - titlebarLeft)
        : null,
      leftToggleLeft: leftToggle
        ? Math.round(leftToggle.getBoundingClientRect().left - titlebarLeft)
        : null,
      leftToggleRight: leftToggle
        ? Math.round(leftToggle.getBoundingClientRect().right - titlebarLeft)
        : null,
      leadingSurfaceCount: document.querySelectorAll('[data-workspace-titlebar-leading-surface]').length,
      mainRailWidth: mainRail ? Math.round(mainRail.getBoundingClientRect().width) : null,
      railDividerLeft: railDivider ? Math.round(railDivider.getBoundingClientRect().left - titlebarLeft) : null,
      titlebarHeight: titlebar ? Math.round(titlebar.getBoundingClientRect().height) : null
    };
  });
}

async function prepareWindow(session: DesktopSession) {
  await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
  if (process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN === '1') return;
  const window = await session.electronApp.browserWindow(session.firstWindow);
  await window.evaluate((target) => {
    target.setBounds({ width: 1600, height: 1000, x: 80, y: 80 });
    target.show();
    target.focus();
    target.webContents.focus();
  });
  await expect.poll(() => window.evaluate((target) => target.isFocused())).toBe(true);
}

async function installHostBoundarySpies(session: DesktopSession) {
  await session.electronApp.evaluate(({ dialog, shell }) => {
    const scope = globalThis as typeof globalThis & {
      __folioleHostBoundarySpy?: {
        dialogParentIds: number[];
        externalUrls: string[];
        restore: () => void;
      };
    };
    const originalOpenExternal = shell.openExternal;
    const originalShowOpenDialog = dialog.showOpenDialog;
    const state = {
      dialogParentIds: [] as number[],
      externalUrls: [] as string[],
      restore: () => {
        shell.openExternal = originalOpenExternal;
        dialog.showOpenDialog = originalShowOpenDialog;
        delete scope.__folioleHostBoundarySpy;
      }
    };
    scope.__folioleHostBoundarySpy = state;
    shell.openExternal = async (url) => { state.externalUrls.push(url); };
    dialog.showOpenDialog = (async (...args: unknown[]) => {
      const parent = args.length > 1 ? args[0] as Electron.BrowserWindow : null;
      if (parent) state.dialogParentIds.push(parent.id);
      return { canceled: true, filePaths: [] };
    }) as typeof dialog.showOpenDialog;
  });
}

test('uses native window controls and keeps the app alive after the last window closes', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.locator('.window-titlebar-controls')).toHaveCount(0);
  const nativeWindow = await desktopSession.electronApp.browserWindow(desktopWindow);
  expect(await nativeWindow.evaluate((target) => target.getWindowButtonPosition())).toEqual({ x: 60, y: 12 });
  const geometry = await readNativeTitlebarGeometry(desktopWindow);
  expect(geometry).toMatchObject({
    folderSurfaceLeft: 40,
    leadingSurfaceCount: 0,
    mainRailWidth: 40,
    railDividerLeft: 40,
    titlebarHeight: 40
  });
  expect(geometry.leftToggleLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.leftToggleRight).toBeLessThanOrEqual(40);
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await desktopWindow.screenshot({ path: path.join(EVIDENCE_DIR, 'macos-native-titlebar-second-column.png') });
  await testInfo.attach('macos-native-titlebar-geometry', {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json'
  });
  await desktopWindow.getByRole('button', { name: TOGGLE_LEFT_PANEL_NAME }).click();
  await expect.poll(() => readListTitlebarWidth(desktopWindow)).toBe('0px');
  const collapsedGeometry = await readNativeTitlebarGeometry(desktopWindow);
  expect(collapsedGeometry).toMatchObject({
    documentSurfaceLeft: 40,
    leadingSurfaceCount: 0,
    mainRailWidth: 40,
    railDividerLeft: 40,
    titlebarHeight: 40
  });
  await desktopWindow.screenshot({ path: path.join(EVIDENCE_DIR, 'macos-native-titlebar-collapsed.png') });
  await testInfo.attach('macos-native-titlebar-collapsed-geometry', {
    body: JSON.stringify(collapsedGeometry, null, 2),
    contentType: 'application/json'
  });
  const closed = desktopWindow.waitForEvent('close');
  await nativeWindow.evaluate((target) => target.close());
  await closed;
  const windowCount = await desktopSession.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(windowCount).toBe(0);
  expect(desktopSession.electronApp.process().exitCode).toBeNull();
  await testInfo.attach('macos-last-window-close', {
    body: JSON.stringify({ processAlive: true, windowCount }, null, 2),
    contentType: 'application/json'
  });
});

test('routes menu commands, renderer keydown, external links, and dialogs through existing boundaries', async ({
  desktopSession,
  desktopWindow
}) => {
  // SKIP: application menu click requires a focused window | 2026-07-14 | revive: run this spec in Visible Native mode
  test.skip(process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN === '1', 'requires a focused application menu');
  await expectWorkspaceShell(desktopWindow);
  const initialWidth = await readListTitlebarWidth(desktopWindow);
  expect(initialWidth).not.toBe('0px');
  await expect.poll(() => desktopSession.electronApp.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.getMenuItemById('workspace.toggleList')?.accelerator ?? null
  )).toBe('Command+Shift+L');

  await clickApplicationMenuItem(desktopSession, 'workspace.toggleList');
  await expect.poll(() => readListTitlebarWidth(desktopWindow)).toBe('0px');
  await desktopWindow.keyboard.press('Meta+Shift+L');
  await expect.poll(() => readListTitlebarWidth(desktopWindow)).toBe(initialWidth);

  await installHostBoundarySpies(desktopSession);

  try {
    await clickApplicationMenuItem(desktopSession, 'support.openRepository');
    await expect.poll(() => desktopSession.electronApp.evaluate(() =>
      (globalThis as typeof globalThis & { __folioleHostBoundarySpy?: { externalUrls: string[] } })
        .__folioleHostBoundarySpy?.externalUrls ?? []
    )).toEqual(['https://github.com/campfirium/foliole']);

    const focusedWindowId = await desktopSession.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getFocusedWindow()?.id ?? null);
    await clickApplicationMenuItem(desktopSession, 'import.singleFileToInbox');
    await expect.poll(() => desktopSession.electronApp.evaluate(() =>
      (globalThis as typeof globalThis & { __folioleHostBoundarySpy?: { dialogParentIds: number[] } })
        .__folioleHostBoundarySpy?.dialogParentIds ?? []
    )).toEqual([focusedWindowId]);
  } finally {
    await desktopSession.electronApp.evaluate(() =>
      (globalThis as typeof globalThis & { __folioleHostBoundarySpy?: { restore: () => void } })
        .__folioleHostBoundarySpy?.restore());
  }
});

test('quits cleanly and relaunches with the same isolated state root', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-macos-lifecycle-'));
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot };
  let firstSession: DesktopSession | null = null;
  let secondSession: DesktopSession | null = null;

  try {
    firstSession = await launchDesktopSession({ env }) as DesktopSession;
    await prepareWindow(firstSession);
    await expectWorkspaceShell(firstSession.firstWindow);
    const child = firstSession.electronApp.process();
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    await firstSession.electronApp.evaluate(({ app }) => {
      setImmediate(() => app.quit());
    });
    expect(await exited).toEqual({ code: 0, signal: null });
    await firstSession.close();

    secondSession = await launchDesktopSession({ env }) as DesktopSession;
    await prepareWindow(secondSession);
    await expectWorkspaceShell(secondSession.firstWindow);
    expect(secondSession.appReady.reported).toBe(true);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await secondSession.firstWindow.screenshot({ path: path.join(EVIDENCE_DIR, 'macos-clean-relaunch.png') });
  } finally {
    await secondSession?.close();
    await firstSession?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
