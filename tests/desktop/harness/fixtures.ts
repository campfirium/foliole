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
  close: () => Promise<void>;
  electronApp: ElectronApplication;
  firstWindow: Page;
  launchOptions: { args: string[]; cwd: string; executablePath?: string; timeout: number };
  snapshot: { appName: string; appPath: string; isReady: boolean };
  target: DesktopLaunchTarget;
  timeoutMs: number;
};

type DesktopFixtures = {
  desktopApp: ElectronApplication;
  desktopSession: DesktopSession;
  desktopWindow: Page;
};

export const test = base.extend<DesktopFixtures>({
  desktopSession: async ({ browserName }, use) => {
    void browserName;
    const session = (await launchDesktopSession()) as DesktopSession;

    try {
      await use(session);
    } finally {
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
