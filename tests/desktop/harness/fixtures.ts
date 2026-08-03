import {
  expect,
  test as base,
  type ElectronApplication,
  type Page
} from '@playwright/test';

import { finalizeDesktopFixture } from '../../../scripts/desktop/playwright-desktop-fixture-teardown.mjs';
import { launchDesktopSession } from '../../../scripts/desktop/playwright-desktop-harness.mjs';

import { attachDesktopAcceptanceEvidence } from './acceptanceEvidence';

export type DesktopLaunchTarget = {
  appRoot: string;
  executablePath?: string | null;
  launchMode: 'args' | 'installed';
  mainEntry: string | null;
  missingPaths: string[];
  preloadPath: string | null;
  rendererIndexPath: string | null;
  runtimeStateRoot: string;
};

export type DesktopSession = {
  appReady: { href: string; readyState: string; reported: boolean };
  collectDiagnostics: () => Promise<unknown>;
  close: () => Promise<void>;
  electronApp: ElectronApplication;
  firstWindow: Page;
  launchOptions: {
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    executablePath?: string;
    timeout: number;
  };
  snapshot: { appName: string; appPath: string; isReady: boolean };
  target: DesktopLaunchTarget;
  timeoutMs: number;
};

type DesktopFixtures = {
  desktopApp: ElectronApplication;
  desktopSession: DesktopSession;
  desktopWindow: Page;
};

async function focusVisibleWindow(session: DesktopSession) {
  const target = await session.electronApp.browserWindow(session.firstWindow);
  await target.evaluate(async (window) => {
    window.setBounds({ width: 1600, height: 1000, x: 80, y: 80 });
    window.show();
    window.setAlwaysOnTop(true);
    window.focus();
    window.webContents.focus();
    window.setAlwaysOnTop(false);
  });
  await expect.poll(
    () => target.evaluate((window) => window.isFocused()),
    { timeout: 3000 }
  ).toBe(true);
}

async function normalizeDesktopWindow(session: DesktopSession) {
  if (process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN === '1') {
    // Hidden native mode must stay offscreen and must not call show() or focus().
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
  } else {
    await focusVisibleWindow(session);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await session.firstWindow.waitForTimeout(150);
  }
  const searchEnhancementPrompt = session.firstWindow.getByRole('dialog', {
    name: /(Turn on search enhancement for languages without spaces|要为无空格语言开启搜索增强)/
  });
  if (await searchEnhancementPrompt.isVisible().catch(() => false)) {
    await searchEnhancementPrompt.getByRole('button', { name: /(Not now|暂不)/ }).click();
  }
}

export const test = base.extend<DesktopFixtures>({
  desktopSession: async ({ browserName }, use, testInfo) => {
    void browserName;
    const session = (await launchDesktopSession()) as DesktopSession;

    try {
      await normalizeDesktopWindow(session);
      await use(session);
    } finally {
      await finalizeDesktopFixture({
        attachEvidence: () => attachDesktopAcceptanceEvidence(session.firstWindow, testInfo),
        attachDiagnostics: async () => testInfo.attach('desktop-failure-diagnostics', {
          body: JSON.stringify(await session.collectDiagnostics(), null, 2),
          contentType: 'application/json'
        }),
        close: () => session.close(),
        failed: testInfo.status !== testInfo.expectedStatus
      });
    }
  },
  desktopApp: async ({ desktopSession }, use) => {
    await use(desktopSession.electronApp);
  },
  desktopWindow: async ({ desktopSession }, use) => {
    await use(desktopSession.firstWindow);
  }
});

export { expect };
