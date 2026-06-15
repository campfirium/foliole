import type { BrowserWindowConstructorOptions } from 'electron';

export const HIDDEN_NATIVE_DESKTOP_TEST_BOUNDS = {
  height: 1000,
  width: 1600,
  x: -32_000,
  y: -32_000
};

export function isHiddenNativeDesktopTest(env: NodeJS.ProcessEnv = process.env) {
  return env.FOLIOLE_ELECTRON_NATIVE_HIDDEN?.trim() === '1';
}

export function applyHiddenNativeDesktopWindowOptions(
  options: BrowserWindowConstructorOptions,
  env: NodeJS.ProcessEnv = process.env
): BrowserWindowConstructorOptions {
  if (!isHiddenNativeDesktopTest(env)) {
    return options;
  }
  return {
    ...options,
    ...HIDDEN_NATIVE_DESKTOP_TEST_BOUNDS,
    focusable: false,
    skipTaskbar: true,
    // Initial creation stays hidden; windowRuntimeDiagnostics.presentInitialRendererWindow()
    // later calls showInactive() so the renderer is visible to Playwright without taking focus.
    show: false
  };
}
