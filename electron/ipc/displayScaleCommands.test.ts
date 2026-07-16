// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  getFocusedWindow: vi.fn(),
  setZoomFactor: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: mocks.fromWebContents,
    getFocusedWindow: mocks.getFocusedWindow
  }
}));

import { handleDisplayScaleCommand } from './displayScaleCommands.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getFocusedWindow.mockReturnValue({ webContents: { setZoomFactor: mocks.setZoomFactor } });
});

it('applies a validated display scale to the focused renderer', () => {
  expect(handleDisplayScaleCommand({ command: 'set_app_display_scale', args: { percent: 140 } })).toBeNull();
  expect(mocks.setZoomFactor).toHaveBeenCalledWith(1.4);
});

it('rejects display scales outside the supported stepped range', () => {
  expect(() => handleDisplayScaleCommand({ command: 'set_app_display_scale', args: { percent: 145 } })).toThrow(
    'percent must be an integer from 80 to 200 in steps of 10'
  );
  expect(mocks.setZoomFactor).not.toHaveBeenCalled();
});
