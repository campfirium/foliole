import { expect, it, vi } from 'vitest';

import { DesktopUpdateService, type DesktopUpdaterAdapter } from './desktopUpdateService.js';

type StoredRecord = {
  checkpoint: 'discovered' | 'downloaded';
  installedVersion: string;
  schemaVersion: 1;
  targetVersion: string;
};

function createStateStore(storedRecord: StoredRecord | null = null) {
  return {
    clear: vi.fn(async () => undefined),
    read: vi.fn(async () => storedRecord),
    write: vi.fn(async () => undefined)
  };
}

function createHarness(options: {
  applicable?: boolean;
  currentVersion?: string;
  isUpdateAvailable?: boolean;
  providerVersion?: string | null;
  storedRecord?: StoredRecord | null;
} = {}) {
  const listeners = new Map<string, (payload?: Record<string, unknown>) => void>();
  let resolveDownload: () => void = () => undefined;
  let rejectDownload: () => void = () => undefined;
  const downloadUpdate = vi.fn(() => new Promise<string[]>((resolve, reject) => {
    resolveDownload = () => resolve(['installer']);
    rejectDownload = () => reject(new Error('download failed'));
  }));
  const updater = {
    allowDowngrade: true,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(async () => options.providerVersion === null
      ? null
      : {
          isUpdateAvailable: options.isUpdateAvailable !== false,
          updateInfo: { version: options.providerVersion ?? '0.7.0' }
        }),
    downloadUpdate,
    on: vi.fn((event: string, listener: (payload?: Record<string, unknown>) => void) => {
      listeners.set(event, listener);
    }),
    quitAndInstall: vi.fn()
  } satisfies DesktopUpdaterAdapter;
  const sender = {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  };
  const prepareInstall = vi.fn(async () => true);
  const loadUpdater = vi.fn(async () => updater);
  const stateStore = createStateStore(options.storedRecord);
  const service = new DesktopUpdateService({
    eventChannel: 'foliole:desktop-update-state',
    getCurrentVersion: () => options.currentVersion ?? '0.6.0',
    isApplicable: () => options.applicable !== false,
    loadUpdater,
    prepareInstall,
    stateStore
  });
  return {
    listeners,
    loadUpdater,
    prepareInstall,
    rejectDownload: () => rejectDownload(),
    resolveDownload: () => resolveDownload(),
    sender,
    service,
    stateStore,
    updater
  };
}

it('does not load or contact the updater outside applicable packaged desktop builds', async () => {
  const harness = createHarness({ applicable: false });

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({ phase: 'not-applicable' });

  expect(harness.loadUpdater).not.toHaveBeenCalled();
  expect(harness.updater.checkForUpdates).not.toHaveBeenCalled();
});

it('treats a provider version mismatch as pending assets even when no provider update is available', async () => {
  const harness = createHarness({ isUpdateAvailable: false, providerVersion: '0.6.0' });

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    phase: 'pending-asset',
    version: '0.7.0'
  });

  expect(harness.updater.autoDownload).toBe(false);
  expect(harness.updater.autoInstallOnAppQuit).toBe(false);
  expect(harness.updater.allowDowngrade).toBe(false);
});

it('hydrates a durable candidate without contacting the provider or restoring ready', async () => {
  const harness = createHarness({
    storedRecord: { checkpoint: 'downloaded', installedVersion: '0.6.0', schemaVersion: 1, targetVersion: '0.7.0' }
  });

  await expect(harness.service.check('', harness.sender as never)).resolves.toEqual({ phase: 'idle' });

  expect(harness.updater.checkForUpdates).not.toHaveBeenCalled();
  expect(harness.updater.downloadUpdate).not.toHaveBeenCalled();
});

it('clears a durable candidate written by a different installed version', async () => {
  const harness = createHarness({
    storedRecord: { checkpoint: 'downloaded', installedVersion: '0.5.0', schemaVersion: 1, targetVersion: '0.7.0' }
  });

  await harness.service.check('', harness.sender as never);

  expect(harness.stateStore.clear).toHaveBeenCalledTimes(1);
  expect(harness.loadUpdater).not.toHaveBeenCalled();
});

it('clears a candidate when the fresh manifest reports the installed version', async () => {
  const harness = createHarness({
    storedRecord: { checkpoint: 'downloaded', installedVersion: '0.6.0', schemaVersion: 1, targetVersion: '0.7.0' }
  });

  await expect(harness.service.check('0.6.0', harness.sender as never)).resolves.toEqual({ phase: 'idle' });

  expect(harness.stateStore.clear).toHaveBeenCalledTimes(1);
  expect(harness.loadUpdater).not.toHaveBeenCalled();
});

it('clears the candidate when the provider reports no applicable update', async () => {
  const harness = createHarness({ isUpdateAvailable: false });

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({ phase: 'idle' });

  expect(harness.stateStore.clear).toHaveBeenCalledTimes(1);
  expect(harness.updater.downloadUpdate).not.toHaveBeenCalled();
});

it('downloads automatically after the provider confirms the gated release', async () => {
  const harness = createHarness();

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'downloading',
    version: '0.7.0'
  });
  expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(1);
  harness.listeners.get('download-progress')?.({ percent: 42.3, total: 1000, transferred: 423 });
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready', version: '0.7.0' }));
});

it('publishes an error when the automatic download fails', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);

  harness.rejectDownload();

  await vi.waitFor(() => expect(harness.service.getState()).toEqual({
    errorCode: 'download-failed',
    phase: 'error',
    version: '0.7.0'
  }));
});

it('does not download when the durable discovery record cannot be written', async () => {
  const harness = createHarness();
  harness.stateStore.write.mockRejectedValueOnce(new Error('disk full'));

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    errorCode: 'check-failed',
    phase: 'error',
    version: '0.7.0'
  });

  expect(harness.loadUpdater).not.toHaveBeenCalled();
});

it('does not publish ready when the downloaded checkpoint cannot be written', async () => {
  const harness = createHarness();
  harness.stateStore.write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
  await harness.service.check('0.7.0', harness.sender as never);

  harness.resolveDownload();

  await vi.waitFor(() => expect(harness.service.getState()).toEqual({
    errorCode: 'download-failed',
    phase: 'error',
    version: '0.7.0'
  }));
});

it('publishes progress and installs only after preparation succeeds', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);

  harness.listeners.get('download-progress')?.({ percent: 42.3, total: 1000, transferred: 423 });
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready', version: '0.7.0' }));
  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toMatchObject({ phase: 'ready' });
  await harness.service.install();

  expect(harness.sender.send).toHaveBeenCalledWith('foliole:desktop-update-state', expect.objectContaining({
    percent: 42.3,
    phase: 'downloading',
    totalBytes: 1000,
    transferredBytes: 423
  }));
  expect(harness.prepareInstall).toHaveBeenCalledTimes(1);
  expect(harness.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

it('blocks installation when application data cannot be flushed', async () => {
  const harness = createHarness();
  harness.prepareInstall.mockResolvedValue(false);
  await harness.service.check('0.7.0', harness.sender as never);
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready' }));

  await expect(harness.service.install()).resolves.toEqual({
    errorCode: 'install-preparation-failed',
    phase: 'error',
    version: '0.7.0'
  });
  expect(harness.updater.quitAndInstall).not.toHaveBeenCalled();
});
