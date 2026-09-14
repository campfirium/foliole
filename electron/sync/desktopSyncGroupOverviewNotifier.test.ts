import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getMainWindow: vi.fn() }));

vi.mock('../mainWindowRegistry.js', () => ({ getMainWindow: mocks.getMainWindow }));

import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('forwards topology invalidation to the active renderer', () => {
  const send = vi.fn();
  mocks.getMainWindow.mockReturnValue({ webContents: { send } });

  notifyDesktopSyncGroupOverviewChanged();

  expect(send).toHaveBeenCalledWith('foliole:sync-group-overview-changed');
});

it('does nothing when no main window is registered', () => {
  mocks.getMainWindow.mockReturnValue(null);

  expect(() => notifyDesktopSyncGroupOverviewChanged()).not.toThrow();
});
