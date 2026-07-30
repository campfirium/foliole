import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

export const MACOS_TRAFFIC_LIGHT_POSITION = { x: 60, y: 12 } as const;

type MainWindowChromeOptions = Pick<
  BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'trafficLightPosition'
>;

export function createMainWindowChromeOptions(
  platform: NodeJS.Platform = process.platform
): MainWindowChromeOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: { ...MACOS_TRAFFIC_LIGHT_POSITION }
    };
  }
  return { frame: false };
}

export function setMainWindowNativeControlsVisible(
  window: Pick<BrowserWindow, 'setWindowButtonVisibility'> | null,
  visible: boolean,
  platform: NodeJS.Platform = process.platform
) {
  if (platform !== 'darwin' || !window) {
    return;
  }
  window.setWindowButtonVisibility(visible);
}
