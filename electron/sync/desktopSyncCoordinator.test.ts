import { beforeEach, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ loadJsonSetting: vi.fn(), saveJsonSetting: vi.fn() }));
const transport = vi.hoisted(() => ({
  continueDesktopSyncGroupSync: vi.fn(),
  loadDesktopSyncGroupPeers: vi.fn()
}));

vi.mock('../database/settingsStore.js', () => settings);
vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/watchedConflictSyncMarker.js', () => ({
  markWatchedConflictDecisionsSynced: vi.fn()
}));
vi.mock('../import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: vi.fn() }));
vi.mock('./desktopSyncGroupTransport.js', () => transport);

import {
  loadDesktopSyncTriggerResult,
  runDesktopSyncCoordinator,
  subscribeDesktopSyncCompleted
} from './desktopSyncCoordinator.js';

const peer = { peer_device_id: 'peer-a' } as never;
const peerB = { peer_device_id: 'peer-b' } as never;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  transport.loadDesktopSyncGroupPeers.mockReturnValue([peer]);
  transport.continueDesktopSyncGroupSync.mockResolvedValue({ complete: true, cursor: 9 });
});

it('joins manual sync to an active automatic run and persists one owned result', async () => {
  const work = deferred<{ complete: boolean; cursor: number }>();
  transport.continueDesktopSyncGroupSync.mockReturnValueOnce(work.promise);

  const automatic = runDesktopSyncCoordinator('automatic');
  const manual = runDesktopSyncCoordinator('manual');
  work.resolve({ complete: true, cursor: 9 });

  await expect(Promise.all([automatic, manual])).resolves.toEqual([
    expect.objectContaining({ reason: 'automatic', status: 'completed' }),
    expect.objectContaining({ reason: 'automatic', status: 'completed' })
  ]);
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledOnce();
  expect(settings.saveJsonSetting).toHaveBeenCalledOnce();
});

it('queues a different preferred Device behind the active run', async () => {
  const work = deferred<{ complete: boolean; cursor: number }>();
  transport.continueDesktopSyncGroupSync.mockReturnValueOnce(work.promise);

  const first = runDesktopSyncCoordinator('automatic', peer);
  const second = runDesktopSyncCoordinator('automatic', peerB);
  expect(second).not.toBe(first);
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledWith(peer);

  work.resolve({ complete: true, cursor: 9 });
  await second;
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenNthCalledWith(2, peerB);
});

it('persists a manual failure while leaving transport cursor ownership unchanged', async () => {
  transport.continueDesktopSyncGroupSync.mockRejectedValueOnce(new Error('sync_pack_apply_failed'));

  await expect(runDesktopSyncCoordinator('manual')).rejects.toThrow('sync_pack_apply_failed');
  expect(settings.saveJsonSetting).toHaveBeenCalledWith(
    'sync_group_last_trigger_result',
    expect.objectContaining({ error: 'sync_pack_apply_failed', reason: 'manual', status: 'failed' })
  );
});

it('loads the last durable trigger result', () => {
  const result = { reason: 'initial', status: 'completed' };
  settings.loadJsonSetting.mockReturnValue(result);
  expect(loadDesktopSyncTriggerResult()).toBe(result);
});

it('publishes actual completion but not failure or a no-peer skip', async () => {
  const completed = vi.fn();
  const unsubscribe = subscribeDesktopSyncCompleted(completed);
  await runDesktopSyncCoordinator('manual');
  transport.loadDesktopSyncGroupPeers.mockReturnValue([]);
  await runDesktopSyncCoordinator('automatic');
  transport.loadDesktopSyncGroupPeers.mockReturnValue([peer]);
  transport.continueDesktopSyncGroupSync.mockRejectedValueOnce(new Error('offline'));
  await expect(runDesktopSyncCoordinator('automatic')).rejects.toThrow('offline');

  expect(completed).toHaveBeenCalledOnce();
  unsubscribe();
});


it('serializes three distinct targets and reuses a queued target', async () => {
  const firstWork = deferred<{ complete: boolean; cursor: number }>();
  const secondWork = deferred<{ complete: boolean; cursor: number }>();
  const peerC = { peer_device_id: 'peer-c' } as never;
  transport.continueDesktopSyncGroupSync.mockReturnValueOnce(firstWork.promise)
    .mockReturnValueOnce(secondWork.promise);
  const first = runDesktopSyncCoordinator('automatic', peer);
  const second = runDesktopSyncCoordinator('automatic', peerB);
  const third = runDesktopSyncCoordinator('automatic', peerC);
  expect(runDesktopSyncCoordinator('manual', peerC)).toBe(third);
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(1);
  firstWork.resolve({ complete: true, cursor: 1 });
  await first;
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(2);
  secondWork.resolve({ complete: true, cursor: 2 });
  await Promise.all([second, third]);
  expect(transport.continueDesktopSyncGroupSync.mock.calls.map(([target]) => target.peer_device_id))
    .toEqual(['peer-a', 'peer-b', 'peer-c']);
});

it('runs queued targets after a predecessor fails', async () => {
  transport.continueDesktopSyncGroupSync.mockRejectedValueOnce(new Error('offline'));
  const first = runDesktopSyncCoordinator('automatic', peer);
  const second = runDesktopSyncCoordinator('automatic', peerB);
  await expect(first).rejects.toThrow('offline');
  await expect(second).resolves.toMatchObject({ status: 'completed' });
});

it.each([null, { complete: false, cursor: 9 }])('does not publish completion for unfinished transport: %j', async (outcome) => {
  const completed = vi.fn();
  const unsubscribe = subscribeDesktopSyncCompleted(completed);
  transport.loadDesktopSyncGroupPeers.mockReturnValue([peer, peerB]);
  transport.continueDesktopSyncGroupSync.mockResolvedValueOnce(outcome);
  try {
    await expect(runDesktopSyncCoordinator('manual')).rejects.toThrow('sync_group_sync_incomplete');
    expect(settings.saveJsonSetting).toHaveBeenLastCalledWith('sync_group_last_trigger_result',
      expect.objectContaining({ status: 'failed', error: 'sync_group_sync_incomplete' }));
    expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(2);
    expect(completed).not.toHaveBeenCalled();
    await expect(runDesktopSyncCoordinator('manual')).resolves.toMatchObject({ status: 'completed' });
    expect(completed).toHaveBeenCalledOnce();
  } finally {
    unsubscribe();
  }
});
