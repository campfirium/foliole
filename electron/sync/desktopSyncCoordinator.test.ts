import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const acknowledged = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./desktopPeerSessionRegistry.js', () => ({ captureDesktopPeerRoundCompletion: () => acknowledged }));

const participation = vi.hoisted(() => ({ active: true }));
vi.mock('./desktopCompanionSyncPreference.js', () => ({ isDesktopCompanionSyncParticipating: () => participation.active }));

const settings = vi.hoisted(() => ({ loadJsonSetting: vi.fn(), saveJsonSetting: vi.fn() }));
const transport = vi.hoisted(() => {
  const loadDesktopSyncGroupPeers = vi.fn();
  // Upstream selection is covered separately; here every listed peer stands in for the chosen upstream.
  return { continueDesktopSyncGroupSync: vi.fn(), loadDesktopSyncGroupPeers,
    loadDesktopSyncUpstreamPeers: vi.fn(() => loadDesktopSyncGroupPeers()) };
});

vi.mock('../database/settingsStore.js', () => settings);
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => null }));
vi.mock('../database/connection.js', () => ({
  registerDatabaseConnectionCleanup: vi.fn(),
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/watchedConflictSyncMarker.js', () => ({
  markWatchedConflictDecisionsSynced: vi.fn()
}));
vi.mock('../import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: vi.fn() }));
vi.mock('./desktopSyncGroupTransport.js', () => transport);

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import {
  loadActiveDesktopSyncRun,
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
  participation.active = true;
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
  expect(settings.saveJsonSetting.mock.calls.filter(([key]) => key === 'sync_group_last_trigger_result')).toHaveLength(1);
});

it('queues a different preferred Device behind the active run', async () => {
  const work = deferred<{ complete: boolean; cursor: number }>();
  transport.continueDesktopSyncGroupSync.mockReturnValueOnce(work.promise);

  const first = runDesktopSyncCoordinator('automatic', peer);
  const second = runDesktopSyncCoordinator('automatic', peerB);
  expect(second).not.toBe(first);
  await vi.waitFor(() => expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledWith(peer, expect.any(Object)));

  work.resolve({ complete: true, cursor: 9 });
  await second;
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenNthCalledWith(2, peerB, expect.any(Object));
});

it('checks every available device when manual sync arrives during a single-device automatic round', async () => {
  const work = deferred<{ complete: boolean; cursor: number }>();
  transport.loadDesktopSyncGroupPeers.mockReturnValue([peer, peerB]);
  transport.continueDesktopSyncGroupSync.mockReturnValueOnce(work.promise);
  const automatic = runDesktopSyncCoordinator('automatic', peer);
  const manual = runDesktopSyncCoordinator('manual');
  const repeatedManual = runDesktopSyncCoordinator('manual');
  work.resolve({ complete: true, cursor: 9 });
  await automatic;
  await manual;
  expect(repeatedManual).toBe(manual);
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledWith(peerB,
    expect.objectContaining({ reason: 'manual' }));
  await expect(manual).resolves.toMatchObject({ reason: 'manual', status: 'completed' });
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
  await vi.waitFor(() => expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(1));
  firstWork.resolve({ complete: true, cursor: 1 });
  await first;
  await vi.waitFor(() => expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(2));
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
    await expect(runDesktopSyncCoordinator('manual')).resolves.toMatchObject({ status: 'pending', error: null });
    expect(settings.saveJsonSetting).toHaveBeenLastCalledWith('sync_group_last_trigger_result',
      expect.objectContaining({ status: 'pending', error: null }));
    expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(2);
    expect(completed).not.toHaveBeenCalled();
    expect(acknowledged).not.toHaveBeenCalled();
    await expect(runDesktopSyncCoordinator('manual')).resolves.toMatchObject({ status: 'completed' });
    expect(completed).toHaveBeenCalledOnce();
    expect(acknowledged).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});

it('keeps the sync result intact when saving diagnostic activity fails', async () => {
  settings.saveJsonSetting.mockImplementation((key: string) => {
    if (key === 'sync_group_activity') throw new Error('diagnostic write failed');
  });
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(runDesktopSyncCoordinator('manual')).resolves.toMatchObject({ status: 'completed' });
    expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledOnce();
    expect(settings.saveJsonSetting).toHaveBeenLastCalledWith('sync_group_last_trigger_result',
      expect.objectContaining({ status: 'completed', error: null }));
  } finally {
    warning.mockRestore(); settings.saveJsonSetting.mockReset();
  }
});

afterEach(() => { desktopSyncChangeSessions().closeAll(); vi.useRealTimers(); });

it('releases the coordinator and persists mobile waiting when an active phone does not finish', async () => {
  vi.useFakeTimers();
  transport.loadDesktopSyncGroupPeers.mockReturnValue([]);
  const sessions = desktopSyncChangeSessions();
  const phone = sessions.open('phone');
  const manual = runDesktopSyncCoordinator('manual');
  await vi.advanceTimersByTimeAsync(20_000);
  sessions.signal('phone', phone.session);
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(manual).resolves.toMatchObject({ status: 'pending', error: null });
  expect(loadActiveDesktopSyncRun()).toBeNull();
  const activity = settings.saveJsonSetting.mock.calls.filter(([key]) => key === 'sync_group_activity').at(-1)?.[1];
  expect(activity).toEqual(expect.arrayContaining([expect.objectContaining({
    kind: 'run_finished', result: 'partial', waiting_for: 'mobile'
  })]));
  transport.loadDesktopSyncGroupPeers.mockReturnValue([peer]);
  await expect(runDesktopSyncCoordinator('manual')).resolves.toMatchObject({ status: 'completed' });
});


it.each([{ attachmentProgress: 1 }, { dynamicBacklog: true }, { attachmentYielded: true }])('queues continuation behind a waiting peer: %j', async progress => {
  const slice = deferred<{ complete: boolean; attachmentProgress?: number; dynamicBacklog?: boolean }>();
  transport.continueDesktopSyncGroupSync.mockImplementationOnce(() => slice.promise);
  const first = runDesktopSyncCoordinator('automatic', peer);
  await vi.waitFor(() => expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(1));
  const waiting = runDesktopSyncCoordinator('manual', peerB);
  slice.resolve({ complete: false, ...progress });
  await expect(first).resolves.toMatchObject({ status: 'pending' });
  await waiting;
  await vi.waitFor(() => expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(3));
  expect(transport.continueDesktopSyncGroupSync.mock.calls.map(([target]) => target)).toEqual([peer, peerB, peer]);
  await loadActiveDesktopSyncRun();
});


it('does not resume an attachment slice after sync participation stops', async () => {
  transport.continueDesktopSyncGroupSync.mockImplementationOnce(async () => {
    participation.active = false;
    return { complete: false, attachmentProgress: 1 };
  });
  await runDesktopSyncCoordinator('automatic', peer);
  await loadActiveDesktopSyncRun();
  expect(transport.continueDesktopSyncGroupSync).toHaveBeenCalledTimes(1);
});
