// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getVersion: () => '1.0.0' } }));
vi.mock('./lanWorkspaceSyncServer.js', () => ({ stopLanWorkspaceSyncServer: vi.fn(async () => undefined) }));
vi.mock('../database/syncGroupStore.js', async () => {
  const { SqliteConnectionCoordinator } = await import('../database/sqliteConnectionCoordinator.js');
  const coordinator = new SqliteConnectionCoordinator();
  return { coordinator, loadDesktopSyncGroup: () => { coordinator.assertAccess(); return null; } };
});
vi.mock('../database/connection.js', async () => {
  const { coordinator } = await import('../database/syncGroupStore.js') as unknown as {
    coordinator: import('../database/sqliteConnectionCoordinator.js').SqliteConnectionCoordinator
  };
  return { runWithDatabaseConnectionOwner: (execute: () => Promise<unknown>) => coordinator.runExclusive(execute) };
});
vi.mock('./desktopCompanionSyncParticipation.js', () => ({ reconcileDesktopCompanionSyncRuntime: vi.fn(async () => undefined) }));

import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { reconcileBackupRestoreSyncRuntime } from './backupRestoreSyncRuntime.js';
import { reconcileDesktopCompanionSyncRuntime } from './desktopCompanionSyncParticipation.js';

it('waits for an existing SQLite owner before reading restored group settings', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const owner = runWithDatabaseConnectionOwner(() => blocked);
  const reconciliation = reconcileBackupRestoreSyncRuntime();
  const outcome = reconciliation.then(() => 'success', error => String(error));
  await new Promise(resolve => setImmediate(resolve));
  release();
  await owner;
  await expect(outcome).resolves.toBe('success');
  expect(reconcileDesktopCompanionSyncRuntime).toHaveBeenCalledOnce();
});

it('releases SQLite ownership before waiting for sync service reconciliation', async () => {
  let finish!: () => void;
  vi.mocked(reconcileDesktopCompanionSyncRuntime).mockImplementationOnce(() =>
    new Promise((resolve) => { finish = () => resolve({
      active_device_count: 0,
      advertised_urls: [],
      last_error: null,
      pending_join_request_count: 0,
      port: null,
      state: 'stopped',
      topology_role: 'observing',
      topology_status: 'observing'
    }); }));

  const reconciliation = reconcileBackupRestoreSyncRuntime();
  await vi.waitFor(() => expect(reconcileDesktopCompanionSyncRuntime).toHaveBeenCalledOnce());
  await expect(runWithDatabaseConnectionOwner(() => 'ordinary-ipc')).resolves.toBe('ordinary-ipc');
  finish();
  await reconciliation;
});
