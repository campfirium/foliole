import { beforeEach, expect, it, vi } from 'vitest';

import {
  closeMainWindow,
  isWindowControlsAvailable,
  minimizeMainWindow,
  queryMainWindowMaximized,
  toggleMainWindowMaximize
} from './windowControls';

const invoke = vi.fn();
const getElectronAPI = vi.fn();
const isDesktopRuntime = vi.fn();

vi.mock('./electronApi', () => ({
  getElectronAPI: () => getElectronAPI()
}));

vi.mock('./runtime', () => ({
  isDesktopRuntime: () => isDesktopRuntime()
}));

beforeEach(() => {
  invoke.mockReset();
  getElectronAPI.mockReset();
  isDesktopRuntime.mockReset();
});

it('reports unavailable controls outside desktop runtime', async () => {
  isDesktopRuntime.mockReturnValue(false);
  getElectronAPI.mockReturnValue(null);

  expect(isWindowControlsAvailable()).toBe(false);
  await expect(queryMainWindowMaximized()).resolves.toBe(false);
});

it('uses invoke fallback when windowControls is missing', async () => {
  isDesktopRuntime.mockReturnValue(true);
  invoke.mockResolvedValueOnce(true).mockResolvedValue(null);
  getElectronAPI.mockReturnValue({ invoke });

  expect(isWindowControlsAvailable()).toBe(true);
  await expect(queryMainWindowMaximized()).resolves.toBe(true);
  await minimizeMainWindow();
  await toggleMainWindowMaximize();
  await closeMainWindow();

  expect(invoke).toHaveBeenNthCalledWith(1, 'window_is_maximized');
  expect(invoke).toHaveBeenNthCalledWith(2, 'window_minimize');
  expect(invoke).toHaveBeenNthCalledWith(3, 'window_toggle_maximize');
  expect(invoke).toHaveBeenNthCalledWith(4, 'window_close');
});

it('prefers direct windowControls API when available', async () => {
  isDesktopRuntime.mockReturnValue(true);
  const controls = {
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    minimize: vi.fn().mockResolvedValue(undefined),
    onResized: vi.fn(),
    toggleMaximize: vi.fn().mockResolvedValue(undefined)
  };
  getElectronAPI.mockReturnValue({ invoke, windowControls: controls });

  await expect(queryMainWindowMaximized()).resolves.toBe(false);
  await minimizeMainWindow();
  await toggleMainWindowMaximize();
  await closeMainWindow();

  expect(controls.isMaximized).toHaveBeenCalledTimes(1);
  expect(controls.minimize).toHaveBeenCalledTimes(1);
  expect(controls.toggleMaximize).toHaveBeenCalledTimes(1);
  expect(controls.close).toHaveBeenCalledTimes(1);
  expect(invoke).not.toHaveBeenCalled();
});
