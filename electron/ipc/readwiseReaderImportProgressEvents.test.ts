// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const getAllWindows = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows } }));

import { notifyReadwiseReaderImportProgress } from './readwiseReaderImportProgressEvents.js';

function createWindow(destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: { send: vi.fn() }
  };
}

const PROGRESS = {
  phase: 'writing' as const,
  processedCount: 4,
  status: 'running' as const,
  totalCount: 10
};

beforeEach(() => vi.clearAllMocks());

it('broadcasts scheduled worker progress to every live renderer', () => {
  const first = createWindow();
  const second = createWindow();
  const destroyed = createWindow(true);
  getAllWindows.mockReturnValue([first, second, destroyed]);

  notifyReadwiseReaderImportProgress(PROGRESS);

  expect(first.webContents.send).toHaveBeenCalledWith('foliole:readwise-reader-import-progress', PROGRESS);
  expect(second.webContents.send).toHaveBeenCalledWith('foliole:readwise-reader-import-progress', PROGRESS);
  expect(destroyed.webContents.send).not.toHaveBeenCalled();
});

it('keeps an explicit manual run scoped to its renderer window', () => {
  const target = createWindow();
  notifyReadwiseReaderImportProgress(PROGRESS, target);

  expect(getAllWindows).not.toHaveBeenCalled();
  expect(target.webContents.send).toHaveBeenCalledWith('foliole:readwise-reader-import-progress', PROGRESS);
});
