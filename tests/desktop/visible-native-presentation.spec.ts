import { expect, test } from './harness/fixtures';

test('visible native desktop presents a focusable on-screen renderer', async ({
  desktopSession,
  desktopWindow
}) => {
  expect(desktopSession.launchOptions.env.FOLIOLE_ELECTRON_NATIVE_VISIBLE).toBe('1');
  expect(desktopSession.launchOptions.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).toBeUndefined();

  const presentation = await desktopSession.electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      return null;
    }
    return {
      bounds: window.getBounds(),
      isFocused: window.isFocused(),
      isFocusable: window.isFocusable(),
      isVisible: window.isVisible()
    };
  });

  expect(presentation).toMatchObject({
    bounds: { height: 1000, width: 1600, x: 80, y: 80 },
    isFocused: true,
    isFocusable: true,
    isVisible: true
  });
  await expect(desktopWindow.evaluate(() => document.visibilityState)).resolves.toBe('visible');
});
