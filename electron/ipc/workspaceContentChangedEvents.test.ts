// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const getAllWindows = vi.hoisted(() => vi.fn());
const requestDesktopHighValueSync = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows
  }
}));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync }));

import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

function createWindow(destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      send: vi.fn()
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('broadcasts workspace content changes to live windows except the origin window', () => {
  const originWindow = createWindow();
  const otherWindow = createWindow();
  const destroyedWindow = createWindow(true);
  getAllWindows.mockReturnValue([originWindow, otherWindow, destroyedWindow]);

  notifyWorkspaceContentChanged(originWindow as never);

  expect(requestDesktopHighValueSync).toHaveBeenCalledOnce();
  expect(originWindow.webContents.send).not.toHaveBeenCalled();
  expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
  expect(otherWindow.webContents.send).toHaveBeenCalledWith('foliole:workspace-content-changed', {
    scope: 'workspace'
  });
});

it('can preserve ambient workspace notification without requesting high-value sync', () => {
  notifyWorkspaceContentChanged(null, { requestSync: false });

  expect(requestDesktopHighValueSync).not.toHaveBeenCalled();
});
