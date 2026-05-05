import { beforeEach, expect, it, vi } from 'vitest';

import {
  closeMainWindow,
  isWindowControlsAvailable,
  minimizeMainWindow,
  onMainWindowResized,
  queryMainWindowMaximized,
  restartMainWindowApp,
  toggleMainWindowDevTools,
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
  const onWindowResized = vi.fn().mockReturnValue(() => undefined);
  getElectronAPI.mockReturnValue({ invoke, onManagedInboxUpdated: vi.fn(), onNativeMenuCommand: vi.fn(), onWindowResized });

  expect(isWindowControlsAvailable()).toBe(true);
  await expect(queryMainWindowMaximized()).resolves.toBe(true);
  await minimizeMainWindow();
  await restartMainWindowApp();
  await toggleMainWindowDevTools();
  await toggleMainWindowMaximize();
  await closeMainWindow();
  await expect(onMainWindowResized(() => undefined)).resolves.toEqual(expect.any(Function));

  expect(invoke).toHaveBeenNthCalledWith(1, 'window_is_maximized');
  expect(invoke).toHaveBeenNthCalledWith(2, 'window_minimize');
  expect(invoke).toHaveBeenNthCalledWith(3, 'window_restart_app');
  expect(invoke).toHaveBeenNthCalledWith(4, 'window_toggle_dev_tools');
  expect(invoke).toHaveBeenNthCalledWith(5, 'window_toggle_maximize');
  expect(invoke).toHaveBeenNthCalledWith(6, 'window_close');
  expect(onWindowResized).toHaveBeenCalledTimes(1);
});

it('uses typed invoke for window commands when desktop bridge is available', async () => {
  isDesktopRuntime.mockReturnValue(true);
  invoke.mockResolvedValueOnce(false).mockResolvedValue(null);
  getElectronAPI.mockReturnValue({
    invoke,
    onManagedInboxUpdated: vi.fn(),
    onNativeMenuCommand: vi.fn(),
    onWindowResized: vi.fn().mockReturnValue(() => undefined)
  });

  await expect(queryMainWindowMaximized()).resolves.toBe(false);
  await minimizeMainWindow();
  await restartMainWindowApp();
  await toggleMainWindowDevTools();
  await toggleMainWindowMaximize();
  await closeMainWindow();

  expect(invoke).toHaveBeenNthCalledWith(1, 'window_is_maximized');
  expect(invoke).toHaveBeenNthCalledWith(2, 'window_minimize');
  expect(invoke).toHaveBeenNthCalledWith(3, 'window_restart_app');
  expect(invoke).toHaveBeenNthCalledWith(4, 'window_toggle_dev_tools');
  expect(invoke).toHaveBeenNthCalledWith(5, 'window_toggle_maximize');
  expect(invoke).toHaveBeenNthCalledWith(6, 'window_close');
});
