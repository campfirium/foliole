import {
  expect,
  test as base,
  type ElectronApplication,
  type Page
} from '@playwright/test';

import { launchDesktopSession } from '../../../scripts/windows/playwright-desktop-harness.mjs';

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

async function normalizeDesktopWindow(session: DesktopSession) {
  await session.electronApp.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    if (!target) {
      return;
    }
    target.setBounds({ width: 1600, height: 1000, x: 80, y: 80 });
    target.show();
    target.focus();
  });
  await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
  await session.firstWindow.waitForTimeout(150);
}

export const test = base.extend<DesktopFixtures>({
  desktopSession: async ({ browserName }, use, testInfo) => {
    void browserName;
    const session = (await launchDesktopSession()) as DesktopSession;

    try {
      await normalizeDesktopWindow(session);
      await use(session);
    } finally {
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
