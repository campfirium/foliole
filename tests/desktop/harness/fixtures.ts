import {
  expect,
  test as base,
  type ElectronApplication,
  type Page
} from '@playwright/test';

import { launchDesktopSession } from '../../../scripts/desktop/playwright-desktop-harness.mjs';

import { attachDesktopAcceptanceEvidence } from './acceptanceEvidence';

export type DesktopLaunchTarget = {
  appRoot: string;
  launchMode: 'args';
  mainEntry: string;
  missingPaths: string[];
  preloadPath: string;
  rendererIndexPath: string;
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
  await session.electronApp.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    if (!target) {
      return;
    }
    target.setBounds({ width: 1600, height: 1000, x: 80, y: 80 });
    target.show();
    target.setAlwaysOnTop(true);
    target.focus();
    target.webContents.focus();
    target.setAlwaysOnTop(false);
  });
  await expect.poll(
    () => session.electronApp.evaluate(({ BrowserWindow }) =>
      Boolean(BrowserWindow.getAllWindows()[0]?.isFocused())
    ),
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
      await attachDesktopAcceptanceEvidence(session.firstWindow, testInfo);
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('desktop-failure-diagnostics', {
          body: JSON.stringify(await session.collectDiagnostics(), null, 2),
          contentType: 'application/json'
        });
      }
      await session.close();
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
