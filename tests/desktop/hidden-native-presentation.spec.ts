import { expect, test } from './harness/fixtures';

const MINIMUM_DESKTOP_BOUNDS = { height: 640, width: 960 };
const REQUESTED_HIDDEN_BOUNDS = { height: 1000, width: 1600 };

test('hidden native desktop presents a noninterfering renderer without focus', async ({
  desktopSession,
  desktopWindow
}) => {
  expect(desktopSession.launchOptions.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).toBe('1');

  const dockPresentation = await desktopSession.electronApp.evaluate(({ app, BrowserWindow }) => ({
    dockVisible: app.dock?.isVisible() ?? null,
    hasFocusedWindow: BrowserWindow.getFocusedWindow() !== null,
    platform: process.platform
  }));
  if (dockPresentation.platform === 'darwin') {
    expect(dockPresentation.dockVisible).toBe(false);
    expect(dockPresentation.hasFocusedWindow).toBe(false);
  }

  const browserWindow = await desktopSession.electronApp.browserWindow(desktopWindow);
  const presentation = await browserWindow.evaluate((window) => {
    return {
      bounds: window.getBounds(),
      isFocusable: window.isFocusable(),
      isFullScreen: window.isFullScreen(),
      isMaximized: window.isMaximized(),
      isVisible: window.isVisible(),
      opacity: window.getOpacity(),
      platform: process.platform
    };
  });

  expect(presentation).toMatchObject({
    isFocusable: false,
    isFullScreen: false,
    isMaximized: false,
    isVisible: true
  });
  expect(presentation.bounds.width).toBeGreaterThanOrEqual(MINIMUM_DESKTOP_BOUNDS.width);
  expect(presentation.bounds.height).toBeGreaterThanOrEqual(MINIMUM_DESKTOP_BOUNDS.height);
  expect(presentation.bounds.width).toBeLessThanOrEqual(REQUESTED_HIDDEN_BOUNDS.width);
  expect(presentation.bounds.height).toBeLessThanOrEqual(REQUESTED_HIDDEN_BOUNDS.height);
  if (presentation?.platform === 'darwin') {
    expect(presentation.opacity).toBe(0);
  } else {
    expect(presentation?.bounds.x).toBeLessThanOrEqual(-10_000);
    expect(presentation?.bounds.y).toBeLessThanOrEqual(-10_000);
  }
  await expect(desktopWindow.evaluate(() => document.visibilityState)).resolves.toBe('visible');
});
