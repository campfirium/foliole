// @vitest-environment node
import { expect, it, vi } from 'vitest';

const windows = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => windows.current } }));

import { recordBackupCleanup } from '../database/backupRetentionStatus.js';

import { IPC_DATABASE_BACKUPS_CHANGED_EVENT_CHANNEL } from './contracts.js';

it('notifies live backup lists after cleanup has been recorded', () => {
  const send = vi.fn();
  const ignored = vi.fn();
  windows.current = [
    { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } },
    { isDestroyed: () => true, webContents: { isDestroyed: () => false, send: ignored } },
    { isDestroyed: () => false, webContents: { isDestroyed: () => true, send: ignored } }
  ];
  recordBackupCleanup('/isolated/backups', {
    capacityDeletedCount: 1, deletedCount: 1, failedCount: 0,
    policyDeletedCount: 0, releasedBytes: 1024
  });
  expect(send).toHaveBeenCalledWith(IPC_DATABASE_BACKUPS_CHANGED_EVENT_CHANNEL);
  expect(ignored).not.toHaveBeenCalled();
});
