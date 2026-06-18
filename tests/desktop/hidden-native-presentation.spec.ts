import { expect, test } from './harness/fixtures';

test('hidden native desktop presents a visible offscreen renderer without focus', async ({
  desktopSession,
  desktopWindow
}) => {
  expect(desktopSession.launchOptions.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).toBe('1');

  const browserWindow = await desktopSession.electronApp.browserWindow(desktopWindow);
  const presentation = await browserWindow.evaluate((window) => {
    return {
      bounds: window.getBounds(),
      isFocusable: window.isFocusable(),
      isVisible: window.isVisible()
    };
  });

  expect(presentation).toMatchObject({
    bounds: { height: 1000, width: 1600 },
    isFocusable: false,
    isVisible: true
  });
  expect(presentation?.bounds.x).toBeLessThanOrEqual(-10_000);
  expect(presentation?.bounds.y).toBeLessThanOrEqual(-10_000);
  await expect(desktopWindow.evaluate(() => document.visibilityState)).resolves.toBe('visible');
});
