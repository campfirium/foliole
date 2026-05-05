// @vitest-environment node
import { expect, it, vi } from 'vitest';

const { clearStorageData, fromPartition } = vi.hoisted(() => ({
  clearStorageData: vi.fn().mockResolvedValue(undefined),
  fromPartition: vi.fn(() => ({ clearStorageData }))
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getFocusedWindow: vi.fn()
  },
  app: {
    exit: vi.fn(),
    getVersion: () => '1.0.0',
    relaunch: vi.fn()
  },
  session: { fromPartition },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn()
  }
}));

vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: vi.fn() }));
vi.mock('../readingPositionTraceLog.js', () => ({ appendReadingPositionTraceRecord: vi.fn() }));
vi.mock('../readingProgressWindowFlush.js', () => ({
  allowWindowCloseWithoutReadingProgressFlush: vi.fn(),
  flushWindowReadingProgress: vi.fn()
}));

import { handleWindowAndUtilityCommand } from './windowCommands.js';

it('clears the persistent link panel webview browsing data partition', async () => {
  await expect(handleWindowAndUtilityCommand({ command: 'clear_link_panel_browsing_data' })).resolves.toMatchObject({
    status: 'cleared'
  });

  expect(fromPartition).toHaveBeenCalledWith('persist:foliole-link-panels');
  expect(clearStorageData).toHaveBeenCalledTimes(1);
});
