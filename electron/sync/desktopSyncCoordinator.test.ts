import { beforeEach, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ loadJsonSetting: vi.fn(), saveJsonSetting: vi.fn() }));
const transport = vi.hoisted(() => ({
  continueDesktopSyncGroupSync: vi.fn(),
  loadDesktopSyncGroupPeers: vi.fn()
}));

vi.mock('../database/settingsStore.js', () => settings);
vi.mock('./desktopSyncGroupTransport.js', () => transport);

import { loadDesktopSyncTriggerResult, runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';

const peer = { peer_authorization_id: 'peer-a' } as never;

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
